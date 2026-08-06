import { randomUUID } from 'node:crypto';

import { requireRole } from './access.mjs';
import { appendAudit } from './audit.mjs';
import { requireReadyUser } from './auth.mjs';
import { isNonEmptyString, publicUser, trimString } from './http.mjs';
import { hashSecret, newSecret } from './security.mjs';

const publicToken = (row) => ({
    id: row.id,
    label: row.label,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    lastUsedAt: row.last_used_at,
});

const adminToken = (row) => ({
    ...publicToken(row),
    owner: {
        id: row.owner_user_id,
        username: row.owner_username,
        displayName: row.owner_display_name,
        department: row.owner_department ?? null,
        active: Boolean(row.owner_active),
    },
});

export const actorAuthentication =
    (db, sessionAuthentication, now = Date.now) =>
    async (request, reply) => {
        const authorization = request.headers.authorization;
        if (!authorization?.startsWith('Bearer ')) {
            await sessionAuthentication(request, reply);
            if (!reply.sent) request.authSource = 'WEB';
            return;
        }

        const secret = authorization.slice('Bearer '.length).trim();
        const timestamp = new Date(now()).toISOString();
        const row = db
            .prepare(
                `SELECT t.id AS token_id, u.*
             FROM api_tokens t
             JOIN users u ON u.id = t.owner_user_id
             WHERE t.token_hash = ?
               AND t.revoked_at IS NULL
               AND (t.expires_at IS NULL OR t.expires_at > ?)
               AND u.active = 1
               AND u.role = 'PUBLISHER'
               AND u.must_change_password = 0`
            )
            .get(hashSecret(secret), timestamp);
        if (!row) {
            return reply.code(401).send({ error: 'Invalid API token.' });
        }
        db.prepare('UPDATE api_tokens SET last_used_at = ? WHERE id = ?').run(
            timestamp,
            row.token_id
        );
        request.user = publicUser(row);
        request.apiTokenId = row.token_id;
        request.authSource = 'API_TOKEN';
    };

export const registerTokenRoutes = async (app, { db }) => {
    const publisherOnly = [
        app.requireSession,
        requireReadyUser,
        requireRole('PUBLISHER'),
    ];
    const adminOnly = [
        app.requireSession,
        requireReadyUser,
        requireRole('ADMIN'),
    ];

    app.get('/api/admin/tokens', { preHandler: adminOnly }, async () => ({
        tokens: db
            .prepare(
                `SELECT t.id, t.label, t.created_at, t.expires_at,
                        t.revoked_at, t.last_used_at,
                        u.id AS owner_user_id, u.username AS owner_username,
                        u.display_name AS owner_display_name,
                        u.department AS owner_department,
                        u.active AS owner_active
                 FROM api_tokens t
                 JOIN users u ON u.id = t.owner_user_id
                 ORDER BY t.created_at DESC`
            )
            .all()
            .map(adminToken),
    }));

    app.delete(
        '/api/admin/tokens/:tokenId',
        { preHandler: adminOnly },
        async (request, reply) => {
            db.exec('BEGIN IMMEDIATE');
            try {
                const token = db
                    .prepare(
                        `SELECT t.id, t.label, u.id AS owner_user_id,
                                u.username AS owner_username
                         FROM api_tokens t
                         JOIN users u ON u.id = t.owner_user_id
                         WHERE t.id = ? AND t.revoked_at IS NULL`
                    )
                    .get(request.params.tokenId);
                if (!token) {
                    db.exec('COMMIT');
                    return reply.code(404).send({ error: 'Token not found.' });
                }
                const now = new Date().toISOString();
                db.prepare(
                    'UPDATE api_tokens SET revoked_at = ? WHERE id = ?'
                ).run(now, token.id);
                appendAudit(db, {
                    actorUserId: request.user.id,
                    action: 'API_TOKEN_REVOKED',
                    targetType: 'API_TOKEN',
                    targetId: token.id,
                    detail: {
                        label: token.label,
                        ownerUserId: token.owner_user_id,
                        ownerUsername: token.owner_username,
                    },
                    at: now,
                });
                db.exec('COMMIT');
                return reply.code(204).send();
            } catch (error) {
                db.exec('ROLLBACK');
                throw error;
            }
        }
    );

    app.get('/api/tokens', { preHandler: publisherOnly }, async (request) => ({
        tokens: db
            .prepare(
                `SELECT * FROM api_tokens
                 WHERE owner_user_id = ?
                 ORDER BY created_at DESC`
            )
            .all(request.user.id)
            .map(publicToken),
    }));

    app.post(
        '/api/tokens',
        { preHandler: publisherOnly },
        async (request, reply) => {
            const label = trimString(request.body?.label);
            if (!isNonEmptyString(label, 100)) {
                return reply
                    .code(422)
                    .send({ error: 'Token label is required.' });
            }
            const id = randomUUID();
            const secret = `cdb_${newSecret()}`;
            const now = new Date().toISOString();
            db.prepare(
                `INSERT INTO api_tokens(
                    id, token_hash, owner_user_id, label, created_at
                 ) VALUES (?, ?, ?, ?, ?)`
            ).run(id, hashSecret(secret), request.user.id, label, now);
            return reply.code(201).send({
                token: secret,
                item: publicToken(
                    db.prepare('SELECT * FROM api_tokens WHERE id = ?').get(id)
                ),
            });
        }
    );

    app.delete(
        '/api/tokens/:tokenId',
        { preHandler: publisherOnly },
        async (request, reply) => {
            const result = db
                .prepare(
                    `UPDATE api_tokens SET revoked_at = ?
                     WHERE id = ? AND owner_user_id = ? AND revoked_at IS NULL`
                )
                .run(
                    new Date().toISOString(),
                    request.params.tokenId,
                    request.user.id
                );
            if (!result.changes) {
                return reply.code(404).send({ error: 'Token not found.' });
            }
            return reply.code(204).send();
        }
    );
};
