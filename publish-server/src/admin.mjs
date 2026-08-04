import { randomUUID } from 'node:crypto';

import { requireRole } from './access.mjs';
import { requireReadyUser } from './auth.mjs';
import { isNonEmptyString, publicUser, trimString } from './http.mjs';
import { hashPassword } from './security.mjs';

const ROLES = new Set(['ADMIN', 'PUBLISHER', 'VIEWER']);
const validUsername = (value) =>
    typeof value === 'string' && /^[A-Za-z0-9._-]{3,64}$/.test(value);

const adminUser = (row) => ({
    ...publicUser(row),
    active: Boolean(row.active),
    createdAt: row.created_at,
});

const duplicateResponse = (error, reply) => {
    if (String(error.message).includes('UNIQUE constraint failed')) {
        reply.code(409).send({ error: 'That value already exists.' });
        return true;
    }
    return false;
};

export const registerAdminRoutes = async (app, { db }) => {
    const adminOnly = [
        app.requireSession,
        requireReadyUser,
        requireRole('ADMIN'),
    ];

    app.get('/api/admin/users', { preHandler: adminOnly }, async () => ({
        users: db
            .prepare('SELECT * FROM users ORDER BY username COLLATE NOCASE')
            .all()
            .map(adminUser),
    }));

    app.post(
        '/api/admin/users',
        { preHandler: adminOnly },
        async (request, reply) => {
            const username = trimString(request.body?.username);
            const requestedDisplayName = trimString(request.body?.displayName);
            const displayName =
                requestedDisplayName === undefined ||
                requestedDisplayName === null ||
                requestedDisplayName === ''
                    ? username
                    : requestedDisplayName;
            const role = request.body?.role;
            const password = request.body?.temporaryPassword;
            if (
                !validUsername(username) ||
                !isNonEmptyString(displayName, 100) ||
                !ROLES.has(role) ||
                typeof password !== 'string' ||
                password.length < 12
            ) {
                return reply.code(422).send({
                    error: 'Valid username, display name, role, and temporary password of at least 12 characters are required.',
                });
            }
            const id = randomUUID();
            const now = new Date().toISOString();
            try {
                db.prepare(
                    `INSERT INTO users(
                        id, username, display_name, password_hash, role,
                        must_change_password, active, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)`
                ).run(
                    id,
                    username,
                    displayName,
                    await hashPassword(password),
                    role,
                    now,
                    now
                );
            } catch (error) {
                if (duplicateResponse(error, reply)) return;
                throw error;
            }
            const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
            return reply.code(201).send({ user: adminUser(user) });
        }
    );

    app.patch(
        '/api/admin/users/:userId',
        { preHandler: adminOnly },
        async (request, reply) => {
            const target = db
                .prepare('SELECT * FROM users WHERE id = ?')
                .get(request.params.userId);
            if (!target)
                return reply.code(404).send({ error: 'User not found.' });

            const displayName =
                request.body?.displayName === undefined
                    ? target.display_name
                    : trimString(request.body.displayName);
            const role = request.body?.role ?? target.role;
            const active =
                request.body?.active === undefined
                    ? Boolean(target.active)
                    : request.body.active;
            if (
                !isNonEmptyString(displayName, 100) ||
                !ROLES.has(role) ||
                typeof active !== 'boolean'
            ) {
                return reply.code(422).send({ error: 'Invalid user update.' });
            }
            if (
                target.id === request.user.id &&
                (!active || role !== 'ADMIN')
            ) {
                return reply.code(409).send({
                    error: 'You cannot disable or demote your own account.',
                });
            }
            if (
                role !== 'PUBLISHER' &&
                db
                    .prepare(
                        'SELECT 1 FROM diagram_publishers WHERE user_id = ? LIMIT 1'
                    )
                    .get(target.id)
            ) {
                return reply.code(409).send({
                    error: 'Remove this user from all diagram publishers before changing the role.',
                });
            }

            const now = new Date().toISOString();
            db.exec('BEGIN IMMEDIATE');
            try {
                db.prepare(
                    `UPDATE users
                     SET display_name = ?, role = ?, active = ?, updated_at = ?
                     WHERE id = ?`
                ).run(displayName, role, active ? 1 : 0, now, target.id);
                if (!active) {
                    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(
                        target.id
                    );
                }
                if (!active || role !== 'PUBLISHER') {
                    db.prepare(
                        `UPDATE api_tokens SET revoked_at = ?
                         WHERE owner_user_id = ? AND revoked_at IS NULL`
                    ).run(now, target.id);
                }
                db.exec('COMMIT');
            } catch (error) {
                db.exec('ROLLBACK');
                throw error;
            }
            return {
                user: adminUser(
                    db
                        .prepare('SELECT * FROM users WHERE id = ?')
                        .get(target.id)
                ),
            };
        }
    );

    app.get('/api/admin/groups', { preHandler: adminOnly }, async () => ({
        groups: db
            .prepare('SELECT * FROM groups ORDER BY name COLLATE NOCASE')
            .all()
            .map((group) => ({
                id: group.id,
                name: group.name,
                userIds: db
                    .prepare(
                        'SELECT user_id FROM user_groups WHERE group_id = ? ORDER BY user_id'
                    )
                    .all(group.id)
                    .map((row) => row.user_id),
            })),
    }));

    app.post(
        '/api/admin/groups',
        { preHandler: adminOnly },
        async (request, reply) => {
            const name = trimString(request.body?.name);
            if (!isNonEmptyString(name, 100)) {
                return reply
                    .code(422)
                    .send({ error: 'Group name is required.' });
            }
            const group = { id: randomUUID(), name };
            try {
                db.prepare(
                    'INSERT INTO groups(id, name, created_at) VALUES (?, ?, ?)'
                ).run(group.id, group.name, new Date().toISOString());
            } catch (error) {
                if (duplicateResponse(error, reply)) return;
                throw error;
            }
            return reply.code(201).send({ group: { ...group, userIds: [] } });
        }
    );

    app.delete(
        '/api/admin/groups/:groupId',
        { preHandler: adminOnly },
        async (request, reply) => {
            const result = db
                .prepare('DELETE FROM groups WHERE id = ?')
                .run(request.params.groupId);
            if (!result.changes) {
                return reply.code(404).send({ error: 'Group not found.' });
            }
            return reply.code(204).send();
        }
    );

    const associationRoute = ({ path, table, leftColumn, rightColumn }) => {
        app.put(path, { preHandler: adminOnly }, async (request, reply) => {
            try {
                db.prepare(
                    `INSERT OR IGNORE INTO ${table}(${leftColumn}, ${rightColumn}) VALUES (?, ?)`
                ).run(
                    request.params[leftColumn.replace('_id', 'Id')],
                    request.params[rightColumn.replace('_id', 'Id')]
                );
            } catch (error) {
                if (
                    String(error.message).includes(
                        'FOREIGN KEY constraint failed'
                    )
                ) {
                    return reply
                        .code(404)
                        .send({ error: 'Related record not found.' });
                }
                throw error;
            }
            return reply.code(204).send();
        });
        app.delete(path, { preHandler: adminOnly }, async (request, reply) => {
            db.prepare(
                `DELETE FROM ${table} WHERE ${leftColumn} = ? AND ${rightColumn} = ?`
            ).run(
                request.params[leftColumn.replace('_id', 'Id')],
                request.params[rightColumn.replace('_id', 'Id')]
            );
            return reply.code(204).send();
        });
    };

    associationRoute({
        path: '/api/admin/groups/:groupId/users/:userId',
        table: 'user_groups',
        leftColumn: 'group_id',
        rightColumn: 'user_id',
    });
    associationRoute({
        path: '/api/admin/diagrams/:diagramId/user-grants/:userId',
        table: 'user_diagram_grants',
        leftColumn: 'diagram_id',
        rightColumn: 'user_id',
    });
    associationRoute({
        path: '/api/admin/diagrams/:diagramId/group-grants/:groupId',
        table: 'group_diagram_grants',
        leftColumn: 'diagram_id',
        rightColumn: 'group_id',
    });

    app.put(
        '/api/admin/diagrams/:diagramId/publishers/:userId',
        { preHandler: adminOnly },
        async (request, reply) => {
            const publisher = db
                .prepare(
                    "SELECT 1 FROM users WHERE id = ? AND role = 'PUBLISHER' AND active = 1"
                )
                .get(request.params.userId);
            const diagram = db
                .prepare('SELECT 1 FROM diagrams WHERE id = ?')
                .get(request.params.diagramId);
            if (!publisher || !diagram) {
                return reply
                    .code(404)
                    .send({ error: 'Publisher or diagram not found.' });
            }
            db.prepare(
                'INSERT OR IGNORE INTO diagram_publishers(diagram_id, user_id) VALUES (?, ?)'
            ).run(request.params.diagramId, request.params.userId);
            return reply.code(204).send();
        }
    );

    app.delete(
        '/api/admin/diagrams/:diagramId/publishers/:userId',
        { preHandler: adminOnly },
        async (request, reply) => {
            db.prepare(
                'DELETE FROM diagram_publishers WHERE diagram_id = ? AND user_id = ?'
            ).run(request.params.diagramId, request.params.userId);
            return reply.code(204).send();
        }
    );

    app.get('/api/admin/diagrams', { preHandler: adminOnly }, async () => ({
        // ponytail: small single-company catalog; replace these per-diagram reads
        // with JSON aggregation only if the admin list becomes measurably slow.
        diagrams: db
            .prepare(
                'SELECT id, name, archived_at FROM diagrams ORDER BY name COLLATE NOCASE'
            )
            .all()
            .map((diagram) => ({
                id: diagram.id,
                name: diagram.name,
                archived: Boolean(diagram.archived_at),
                publisherIds: db
                    .prepare(
                        'SELECT user_id FROM diagram_publishers WHERE diagram_id = ?'
                    )
                    .all(diagram.id)
                    .map((row) => row.user_id),
                userGrantIds: db
                    .prepare(
                        'SELECT user_id FROM user_diagram_grants WHERE diagram_id = ?'
                    )
                    .all(diagram.id)
                    .map((row) => row.user_id),
                groupGrantIds: db
                    .prepare(
                        'SELECT group_id FROM group_diagram_grants WHERE diagram_id = ?'
                    )
                    .all(diagram.id)
                    .map((row) => row.group_id),
            })),
    }));
};
