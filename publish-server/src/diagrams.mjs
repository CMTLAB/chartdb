import { randomUUID } from 'node:crypto';

import { canPublishDiagram, canReadDiagram, requireRole } from './access.mjs';
import { appendAudit } from './audit.mjs';
import { requireReadyUser } from './auth.mjs';
import { isDiagramShaped } from './diagram-validation.mjs';
import { metadataToDiagramJSON } from '../convert-bundle.mjs';
import { preserveSharedLayout } from '../preserve-layout.mjs';

const PUBLISH_BODY_LIMIT = 50 * 1024 * 1024;

const parseContent = (text) => {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
};

const validNote = (value) =>
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim().length <= 500);

const createVersion = (
    db,
    { diagramId, diagram, actor, apiTokenId = null, source, changeNote = null }
) => {
    const current = db
        .prepare(
            `SELECT COALESCE(MAX(version_no), 0) AS version
             FROM diagram_versions WHERE diagram_id = ?`
        )
        .get(diagramId).version;
    const version = current + 1;
    const versionId = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
        `INSERT INTO diagram_versions(
            id, diagram_id, version_no, content_json, changed_by_user_id,
            api_token_id, source, change_note, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
        versionId,
        diagramId,
        version,
        JSON.stringify(diagram),
        actor.id,
        apiTokenId,
        source,
        changeNote?.trim() || null,
        now
    );
    db.prepare(
        `UPDATE diagrams
         SET name = ?, current_version_id = ?, updated_at = ?
         WHERE id = ?`
    ).run(diagram.name.trim(), versionId, now, diagramId);
    return { id: versionId, version, createdAt: now };
};

const transact = (db, operation) => {
    db.exec('BEGIN IMMEDIATE');
    try {
        const result = operation();
        db.exec('COMMIT');
        return result;
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
};

const requireReadable = (db, request, reply) => {
    if (!canReadDiagram(db, request.user, request.params.diagramId)) {
        reply.code(404).send({ error: 'Diagram not found.' });
        return false;
    }
    return true;
};

const requirePublishable = (db, request, reply) => {
    if (!canPublishDiagram(db, request.user, request.params.diagramId)) {
        reply.code(404).send({ error: 'Diagram not found.' });
        return false;
    }
    return true;
};

const publicVersion = (row) => ({
    id: row.id,
    version: row.version_no,
    changedBy: {
        id: row.changed_by_user_id,
        username: row.username,
        displayName: row.display_name,
    },
    source: row.source,
    changeNote: row.change_note,
    createdAt: row.created_at,
});

export const registerDiagramRoutes = async (app, { db, authenticateActor }) => {
    const readySession = [app.requireSession, requireReadyUser];
    const publisherSession = [
        app.requireSession,
        requireReadyUser,
        requireRole('ADMIN', 'PUBLISHER'),
    ];
    const publishableActor = [
        authenticateActor,
        requireReadyUser,
        async (request, reply) => {
            requirePublishable(db, request, reply);
        },
    ];

    app.get('/api/diagrams', { preHandler: readySession }, async (request) => {
        const diagrams = db
            .prepare(
                `SELECT d.id, d.name, d.updated_at, v.version_no
                 FROM diagrams d
                 JOIN diagram_versions v ON v.id = d.current_version_id
                 WHERE d.archived_at IS NULL
                 ORDER BY d.name COLLATE NOCASE`
            )
            .all()
            .filter((diagram) => canReadDiagram(db, request.user, diagram.id))
            .map((diagram) => ({
                id: diagram.id,
                name: diagram.name,
                currentVersion: diagram.version_no,
                updatedAt: diagram.updated_at,
                canPublish: canPublishDiagram(db, request.user, diagram.id),
            }));
        return { diagrams };
    });

    app.post(
        '/api/diagrams',
        {
            bodyLimit: PUBLISH_BODY_LIMIT,
            onRequest: publisherSession,
        },
        async (request, reply) => {
            const diagram = request.body?.diagram;
            const changeNote = request.body?.changeNote;
            if (!isDiagramShaped(diagram) || !validNote(changeNote)) {
                return reply
                    .code(422)
                    .send({ error: 'Invalid ChartDB diagram.' });
            }
            const diagramId = randomUUID();
            const now = new Date().toISOString();
            const version = transact(db, () => {
                db.prepare(
                    `INSERT INTO diagrams(
                        id, name, created_by_user_id, created_at, updated_at
                     ) VALUES (?, ?, ?, ?, ?)`
                ).run(
                    diagramId,
                    diagram.name.trim(),
                    request.user.id,
                    now,
                    now
                );
                if (request.user.role === 'PUBLISHER') {
                    db.prepare(
                        'INSERT INTO diagram_publishers(diagram_id, user_id) VALUES (?, ?)'
                    ).run(diagramId, request.user.id);
                }
                return createVersion(db, {
                    diagramId,
                    diagram,
                    actor: request.user,
                    source: 'WEB',
                    changeNote,
                });
            });
            return reply.code(201).send({
                id: diagramId,
                versionId: version.id,
                version: version.version,
                createdAt: version.createdAt,
            });
        }
    );

    app.get(
        '/api/diagrams/:diagramId',
        { preHandler: readySession },
        async (request, reply) => {
            if (!requireReadable(db, request, reply)) return;
            const row = db
                .prepare(
                    `SELECT d.id, d.name, d.updated_at, v.version_no, v.content_json
                     FROM diagrams d
                     JOIN diagram_versions v ON v.id = d.current_version_id
                     WHERE d.id = ?`
                )
                .get(request.params.diagramId);
            return {
                id: row.id,
                name: row.name,
                currentVersion: row.version_no,
                updatedAt: row.updated_at,
                canPublish: canPublishDiagram(db, request.user, row.id),
                diagram: parseContent(row.content_json),
            };
        }
    );

    app.post(
        '/api/diagrams/:diagramId/versions',
        {
            bodyLimit: PUBLISH_BODY_LIMIT,
            onRequest: publishableActor,
        },
        async (request, reply) => {
            const diagram = request.body?.diagram;
            const changeNote = request.body?.changeNote;
            if (!isDiagramShaped(diagram) || !validNote(changeNote)) {
                return reply
                    .code(422)
                    .send({ error: 'Invalid ChartDB diagram.' });
            }
            const version = transact(db, () =>
                createVersion(db, {
                    diagramId: request.params.diagramId,
                    diagram,
                    actor: request.user,
                    apiTokenId: request.apiTokenId || null,
                    source: request.authSource,
                    changeNote,
                })
            );
            return reply.code(201).send({
                id: request.params.diagramId,
                versionId: version.id,
                version: version.version,
                createdAt: version.createdAt,
            });
        }
    );

    app.get(
        '/api/diagrams/:diagramId/versions',
        { preHandler: readySession },
        async (request, reply) => {
            if (!requireReadable(db, request, reply)) return;
            const versions = db
                .prepare(
                    `SELECT v.*, u.username, u.display_name
                     FROM diagram_versions v
                     JOIN users u ON u.id = v.changed_by_user_id
                     WHERE v.diagram_id = ?
                     ORDER BY v.version_no DESC`
                )
                .all(request.params.diagramId)
                .map(publicVersion);
            return { versions };
        }
    );

    app.get(
        '/api/diagrams/:diagramId/versions/:version',
        { preHandler: readySession },
        async (request, reply) => {
            if (!requireReadable(db, request, reply)) return;
            const row = db
                .prepare(
                    `SELECT v.*, u.username, u.display_name
                     FROM diagram_versions v
                     JOIN users u ON u.id = v.changed_by_user_id
                     WHERE v.diagram_id = ? AND v.version_no = ?`
                )
                .get(request.params.diagramId, Number(request.params.version));
            if (!row)
                return reply.code(404).send({ error: 'Version not found.' });
            return {
                version: publicVersion(row),
                diagram: parseContent(row.content_json),
            };
        }
    );

    app.post(
        '/api/diagrams/:diagramId/versions/:version/restore',
        { preHandler: publisherSession },
        async (request, reply) => {
            if (!requirePublishable(db, request, reply)) return;
            const source = db
                .prepare(
                    `SELECT content_json FROM diagram_versions
                     WHERE diagram_id = ? AND version_no = ?`
                )
                .get(request.params.diagramId, Number(request.params.version));
            if (!source)
                return reply.code(404).send({ error: 'Version not found.' });
            const diagram = parseContent(source.content_json);
            const changeNote = request.body?.changeNote;
            if (!validNote(changeNote)) {
                return reply
                    .code(422)
                    .send({ error: 'Change note is too long.' });
            }
            const version = transact(db, () =>
                createVersion(db, {
                    diagramId: request.params.diagramId,
                    diagram,
                    actor: request.user,
                    source: 'RESTORE',
                    changeNote:
                        changeNote ??
                        `Restored version ${request.params.version}`,
                })
            );
            return reply.code(201).send({
                id: request.params.diagramId,
                versionId: version.id,
                version: version.version,
                createdAt: version.createdAt,
            });
        }
    );

    app.post(
        '/api/diagrams/:diagramId/metadata',
        {
            bodyLimit: PUBLISH_BODY_LIMIT,
            onRequest: publishableActor,
        },
        async (request, reply) => {
            const databaseType = request.body?.databaseType;
            const metadata = request.body?.metadata;
            const changeNote = request.body?.changeNote;
            if (
                typeof databaseType !== 'string' ||
                !metadata ||
                typeof metadata !== 'object' ||
                !validNote(changeNote)
            ) {
                return reply.code(422).send({
                    error: 'databaseType and metadata are required.',
                });
            }
            const current = db
                .prepare(
                    `SELECT d.name, v.content_json
                     FROM diagrams d JOIN diagram_versions v ON v.id = d.current_version_id
                     WHERE d.id = ?`
                )
                .get(request.params.diagramId);
            let generated;
            try {
                const fresh = parseContent(
                    await metadataToDiagramJSON({
                        name: current.name,
                        databaseType,
                        metadata,
                    })
                );
                generated = preserveSharedLayout(
                    fresh,
                    parseContent(current.content_json)
                );
            } catch (error) {
                return reply.code(422).send({
                    error: `Metadata conversion failed: ${error.message}`,
                });
            }
            if (!isDiagramShaped(generated)) {
                return reply
                    .code(422)
                    .send({ error: 'Converted diagram is invalid.' });
            }
            const version = transact(db, () =>
                createVersion(db, {
                    diagramId: request.params.diagramId,
                    diagram: generated,
                    actor: request.user,
                    apiTokenId: request.apiTokenId || null,
                    source: request.authSource,
                    changeNote,
                })
            );
            return reply.code(201).send({
                id: request.params.diagramId,
                versionId: version.id,
                version: version.version,
                createdAt: version.createdAt,
            });
        }
    );

    const adminOnly = [
        app.requireSession,
        requireReadyUser,
        requireRole('ADMIN'),
    ];
    app.post(
        '/api/admin/diagrams/:diagramId/archive',
        { preHandler: adminOnly },
        async (request, reply) => {
            const now = new Date().toISOString();
            db.exec('BEGIN IMMEDIATE');
            try {
                const result = db
                    .prepare(
                        `UPDATE diagrams SET archived_at = ?, updated_at = ?
                         WHERE id = ? AND archived_at IS NULL`
                    )
                    .run(now, now, request.params.diagramId);
                if (!result.changes) {
                    db.exec('ROLLBACK');
                    return reply
                        .code(404)
                        .send({ error: 'Diagram not found.' });
                }
                appendAudit(db, {
                    actorUserId: request.user.id,
                    action: 'DIAGRAM_ARCHIVED',
                    targetType: 'DIAGRAM',
                    targetId: request.params.diagramId,
                    detail: { archived: true },
                    at: now,
                });
                db.exec('COMMIT');
            } catch (error) {
                db.exec('ROLLBACK');
                throw error;
            }
            return reply.code(204).send();
        }
    );
    app.post(
        '/api/admin/diagrams/:diagramId/unarchive',
        { preHandler: adminOnly },
        async (request, reply) => {
            const now = new Date().toISOString();
            db.exec('BEGIN IMMEDIATE');
            try {
                const result = db
                    .prepare(
                        `UPDATE diagrams SET archived_at = NULL, updated_at = ?
                         WHERE id = ? AND archived_at IS NOT NULL`
                    )
                    .run(now, request.params.diagramId);
                if (!result.changes) {
                    db.exec('ROLLBACK');
                    return reply
                        .code(404)
                        .send({ error: 'Diagram not found.' });
                }
                appendAudit(db, {
                    actorUserId: request.user.id,
                    action: 'DIAGRAM_UNARCHIVED',
                    targetType: 'DIAGRAM',
                    targetId: request.params.diagramId,
                    detail: { archived: false },
                    at: now,
                });
                db.exec('COMMIT');
            } catch (error) {
                db.exec('ROLLBACK');
                throw error;
            }
            return reply.code(204).send();
        }
    );
};
