import { randomUUID } from 'node:crypto';

import { requireRole } from './access.mjs';
import {
    canAddDirectViewer,
    canAddGroupMember,
    canAddPublisher,
    groupExists,
} from './admin-access.mjs';
import { appendAudit } from './audit.mjs';
import { requireReadyUser } from './auth.mjs';
import { isNonEmptyString, publicUser, trimString } from './http.mjs';
import { hashPassword } from './security.mjs';

const ROLES = new Set(['ADMIN', 'PUBLISHER', 'VIEWER']);
const validUsername = (value) =>
    typeof value === 'string' && /^[A-Za-z0-9._-]{3,64}$/.test(value);
const optionalDepartment = (value) => {
    const trimmed = trimString(value);
    return trimmed === undefined || trimmed === null || trimmed === ''
        ? null
        : trimmed;
};

const adminUser = (row) => ({
    ...publicUser(row),
    department: row.department ?? null,
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

const adminGroup = (db, group) => {
    const userIds = db
        .prepare(
            'SELECT user_id FROM user_groups WHERE group_id = ? ORDER BY user_id'
        )
        .all(group.id)
        .map((row) => row.user_id);
    return {
        id: group.id,
        name: group.name,
        userIds,
        diagramGrantCount: db
            .prepare(
                'SELECT COUNT(*) AS count FROM group_diagram_grants WHERE group_id = ?'
            )
            .get(group.id).count,
    };
};

const adminDiagram = (db, diagram) => {
    const publisherIds = db
        .prepare(
            'SELECT user_id FROM diagram_publishers WHERE diagram_id = ? ORDER BY user_id'
        )
        .all(diagram.id)
        .map((row) => row.user_id);
    const userGrantIds = db
        .prepare(
            'SELECT user_id FROM user_diagram_grants WHERE diagram_id = ? ORDER BY user_id'
        )
        .all(diagram.id)
        .map((row) => row.user_id);
    const groupGrantIds = db
        .prepare(
            'SELECT group_id FROM group_diagram_grants WHERE diagram_id = ? ORDER BY group_id'
        )
        .all(diagram.id)
        .map((row) => row.group_id);
    return {
        id: diagram.id,
        name: diagram.name,
        archived: Boolean(diagram.archived_at),
        createdByUsername: diagram.created_by_username,
        createdAt: diagram.created_at,
        publisherIds,
        userGrantIds,
        groupGrantIds,
        publisherCount: publisherIds.length,
        userGrantCount: userGrantIds.length,
        groupGrantCount: groupGrantIds.length,
    };
};

const idArray = (body, key) => {
    const value = body?.[key];
    if (
        !Array.isArray(value) ||
        value.some((id) => typeof id !== 'string' || id.length === 0) ||
        new Set(value).size !== value.length
    ) {
        return null;
    }
    return value;
};

const sorted = (values) => [...values].sort();

const transact = (db, action) => {
    db.exec('BEGIN IMMEDIATE');
    try {
        const result = action();
        db.exec('COMMIT');
        return result;
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
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
            const department = optionalDepartment(request.body?.department);
            const role = request.body?.role;
            const password = request.body?.temporaryPassword;
            if (
                !validUsername(username) ||
                !isNonEmptyString(displayName, 100) ||
                (department !== null && !isNonEmptyString(department, 100)) ||
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
            const passwordHash = await hashPassword(password);
            try {
                transact(db, () => {
                    db.prepare(
                        `INSERT INTO users(
                            id, username, display_name, department, password_hash, role,
                            must_change_password, active, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`
                    ).run(
                        id,
                        username,
                        displayName,
                        department,
                        passwordHash,
                        role,
                        now,
                        now
                    );
                    appendAudit(db, {
                        actorUserId: request.user.id,
                        action: 'USER_CREATED',
                        targetType: 'USER',
                        targetId: id,
                        detail: { username, displayName, department, role },
                        at: now,
                    });
                });
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
            const department =
                request.body?.department === undefined
                    ? target.department
                    : optionalDepartment(request.body.department);
            const role = request.body?.role ?? target.role;
            const active =
                request.body?.active === undefined
                    ? Boolean(target.active)
                    : request.body.active;
            if (
                !isNonEmptyString(displayName, 100) ||
                (department !== null && !isNonEmptyString(department, 100)) ||
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
            const temporaryPassword = request.body?.temporaryPassword;
            if (
                temporaryPassword !== undefined &&
                (typeof temporaryPassword !== 'string' ||
                    temporaryPassword.length < 12)
            ) {
                return reply.code(422).send({ error: 'Invalid user update.' });
            }
            const passwordHash =
                temporaryPassword === undefined
                    ? null
                    : await hashPassword(temporaryPassword);

            const now = new Date().toISOString();
            transact(db, () => {
                db.prepare(
                    `UPDATE users
                     SET display_name = ?, department = ?, role = ?, active = ?, updated_at = ?
                     WHERE id = ?`
                ).run(
                    displayName,
                    department,
                    role,
                    active ? 1 : 0,
                    now,
                    target.id
                );
                if (passwordHash !== null) {
                    db.prepare(
                        `UPDATE users
                         SET password_hash = ?, must_change_password = 1, updated_at = ?
                         WHERE id = ?`
                    ).run(passwordHash, now, target.id);
                    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(
                        target.id
                    );
                }
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
                appendAudit(db, {
                    actorUserId: request.user.id,
                    action: 'USER_UPDATED',
                    targetType: 'USER',
                    targetId: target.id,
                    detail: {
                        before: {
                            displayName: target.display_name,
                            department: target.department,
                            role: target.role,
                            active: Boolean(target.active),
                        },
                        after: { displayName, department, role, active },
                        passwordReset: passwordHash !== null,
                    },
                    at: now,
                });
            });
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
            .map((group) => adminGroup(db, group)),
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
            const now = new Date().toISOString();
            try {
                transact(db, () => {
                    db.prepare(
                        'INSERT INTO groups(id, name, created_at) VALUES (?, ?, ?)'
                    ).run(group.id, group.name, now);
                    appendAudit(db, {
                        actorUserId: request.user.id,
                        action: 'GROUP_CREATED',
                        targetType: 'GROUP',
                        targetId: group.id,
                        detail: { name },
                        at: now,
                    });
                });
            } catch (error) {
                if (duplicateResponse(error, reply)) return;
                throw error;
            }
            return reply.code(201).send({ group: adminGroup(db, group) });
        }
    );

    app.put(
        '/api/admin/groups/:groupId/members',
        { preHandler: adminOnly },
        async (request, reply) => {
            const userIds = idArray(request.body, 'userIds');
            if (!userIds) {
                return reply.code(422).send({
                    error: 'Valid unique member IDs are required.',
                });
            }
            const group = db
                .prepare('SELECT * FROM groups WHERE id = ?')
                .get(request.params.groupId);
            if (!group) {
                return reply.code(404).send({ error: 'Group not found.' });
            }
            const currentIds = new Set(
                db
                    .prepare(
                        'SELECT user_id FROM user_groups WHERE group_id = ?'
                    )
                    .all(group.id)
                    .map((row) => row.user_id)
            );
            if (
                userIds.some(
                    (id) => !currentIds.has(id) && !canAddGroupMember(db, id)
                )
            ) {
                return reply.code(422).send({
                    error: 'One or more members are not allowed.',
                });
            }

            transact(db, () => {
                db.prepare('DELETE FROM user_groups WHERE group_id = ?').run(
                    group.id
                );
                const insert = db.prepare(
                    'INSERT INTO user_groups(group_id, user_id) VALUES (?, ?)'
                );
                for (const userId of userIds) {
                    insert.run(group.id, userId);
                }
                appendAudit(db, {
                    actorUserId: request.user.id,
                    action: 'GROUP_MEMBERS_REPLACED',
                    targetType: 'GROUP',
                    targetId: group.id,
                    detail: {
                        before: sorted(currentIds),
                        after: sorted(userIds),
                    },
                });
            });
            return { group: adminGroup(db, group) };
        }
    );

    app.delete(
        '/api/admin/groups/:groupId',
        { preHandler: adminOnly },
        async (request, reply) => {
            const group = db
                .prepare('SELECT * FROM groups WHERE id = ?')
                .get(request.params.groupId);
            if (!group) {
                return reply.code(404).send({ error: 'Group not found.' });
            }
            const before = adminGroup(db, group);
            transact(db, () => {
                db.prepare('DELETE FROM groups WHERE id = ?').run(group.id);
                appendAudit(db, {
                    actorUserId: request.user.id,
                    action: 'GROUP_DELETED',
                    targetType: 'GROUP',
                    targetId: group.id,
                    detail: before,
                });
            });
            return reply.code(204).send();
        }
    );

    const associationRoute = ({
        path,
        table,
        leftColumn,
        rightColumn,
        allowAdd,
        targetType,
    }) => {
        app.put(path, { preHandler: adminOnly }, async (request, reply) => {
            const leftId = request.params[leftColumn.replace('_id', 'Id')];
            const rightId = request.params[rightColumn.replace('_id', 'Id')];
            if (!allowAdd(leftId, rightId)) {
                return reply
                    .code(422)
                    .send({ error: 'This assignment is not allowed.' });
            }
            try {
                transact(db, () => {
                    const result = db
                        .prepare(
                            `INSERT OR IGNORE INTO ${table}(${leftColumn}, ${rightColumn}) VALUES (?, ?)`
                        )
                        .run(leftId, rightId);
                    if (result.changes) {
                        appendAudit(db, {
                            actorUserId: request.user.id,
                            action: 'ASSIGNMENT_ADDED',
                            targetType,
                            targetId: leftId,
                            detail: { table, assignedId: rightId },
                        });
                    }
                });
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
            const leftId = request.params[leftColumn.replace('_id', 'Id')];
            const rightId = request.params[rightColumn.replace('_id', 'Id')];
            transact(db, () => {
                const result = db
                    .prepare(
                        `DELETE FROM ${table} WHERE ${leftColumn} = ? AND ${rightColumn} = ?`
                    )
                    .run(leftId, rightId);
                if (result.changes) {
                    appendAudit(db, {
                        actorUserId: request.user.id,
                        action: 'ASSIGNMENT_REMOVED',
                        targetType,
                        targetId: leftId,
                        detail: { table, assignedId: rightId },
                    });
                }
            });
            return reply.code(204).send();
        });
    };

    app.put(
        '/api/admin/diagrams/:diagramId/access',
        { preHandler: adminOnly },
        async (request, reply) => {
            const publisherIds = idArray(request.body, 'publisherIds');
            const userGrantIds = idArray(request.body, 'userGrantIds');
            const groupGrantIds = idArray(request.body, 'groupGrantIds');
            if (!publisherIds || !userGrantIds || !groupGrantIds) {
                return reply.code(422).send({
                    error: 'Valid unique assignment IDs are required.',
                });
            }

            const diagram = db
                .prepare(
                    `SELECT d.id, d.name, d.archived_at, d.created_at,
                            u.username AS created_by_username
                     FROM diagrams d
                     JOIN users u ON u.id = d.created_by_user_id
                     WHERE d.id = ?`
                )
                .get(request.params.diagramId);
            if (!diagram) {
                return reply.code(404).send({ error: 'Diagram not found.' });
            }

            const currentIds = (table, column) =>
                new Set(
                    db
                        .prepare(
                            `SELECT ${column} AS id FROM ${table} WHERE diagram_id = ?`
                        )
                        .all(diagram.id)
                        .map((row) => row.id)
                );
            const currentPublishers = currentIds(
                'diagram_publishers',
                'user_id'
            );
            const currentUsers = currentIds('user_diagram_grants', 'user_id');
            const currentGroups = currentIds(
                'group_diagram_grants',
                'group_id'
            );
            if (
                publisherIds.some(
                    (id) =>
                        !currentPublishers.has(id) && !canAddPublisher(db, id)
                ) ||
                userGrantIds.some(
                    (id) => !currentUsers.has(id) && !canAddDirectViewer(db, id)
                ) ||
                groupGrantIds.some((id) => !groupExists(db, id))
            ) {
                return reply.code(422).send({
                    error: 'One or more assignments are not allowed.',
                });
            }

            transact(db, () => {
                db.prepare(
                    'DELETE FROM diagram_publishers WHERE diagram_id = ?'
                ).run(diagram.id);
                db.prepare(
                    'DELETE FROM user_diagram_grants WHERE diagram_id = ?'
                ).run(diagram.id);
                db.prepare(
                    'DELETE FROM group_diagram_grants WHERE diagram_id = ?'
                ).run(diagram.id);
                const insertPublisher = db.prepare(
                    'INSERT INTO diagram_publishers(diagram_id, user_id) VALUES (?, ?)'
                );
                const insertUser = db.prepare(
                    'INSERT INTO user_diagram_grants(diagram_id, user_id) VALUES (?, ?)'
                );
                const insertGroup = db.prepare(
                    'INSERT INTO group_diagram_grants(diagram_id, group_id) VALUES (?, ?)'
                );
                for (const id of publisherIds) {
                    insertPublisher.run(diagram.id, id);
                }
                for (const id of userGrantIds) {
                    insertUser.run(diagram.id, id);
                }
                for (const id of groupGrantIds) {
                    insertGroup.run(diagram.id, id);
                }
                appendAudit(db, {
                    actorUserId: request.user.id,
                    action: 'DIAGRAM_ACCESS_REPLACED',
                    targetType: 'DIAGRAM',
                    targetId: diagram.id,
                    detail: {
                        before: {
                            publisherIds: sorted(currentPublishers),
                            userGrantIds: sorted(currentUsers),
                            groupGrantIds: sorted(currentGroups),
                        },
                        after: {
                            publisherIds: sorted(publisherIds),
                            userGrantIds: sorted(userGrantIds),
                            groupGrantIds: sorted(groupGrantIds),
                        },
                    },
                });
            });
            return { diagram: adminDiagram(db, diagram) };
        }
    );

    associationRoute({
        path: '/api/admin/groups/:groupId/users/:userId',
        table: 'user_groups',
        leftColumn: 'group_id',
        rightColumn: 'user_id',
        allowAdd: (_groupId, userId) => canAddGroupMember(db, userId),
        targetType: 'GROUP',
    });
    associationRoute({
        path: '/api/admin/diagrams/:diagramId/user-grants/:userId',
        table: 'user_diagram_grants',
        leftColumn: 'diagram_id',
        rightColumn: 'user_id',
        allowAdd: (_diagramId, userId) => canAddDirectViewer(db, userId),
        targetType: 'DIAGRAM',
    });
    associationRoute({
        path: '/api/admin/diagrams/:diagramId/group-grants/:groupId',
        table: 'group_diagram_grants',
        leftColumn: 'diagram_id',
        rightColumn: 'group_id',
        allowAdd: (_diagramId, groupId) => groupExists(db, groupId),
        targetType: 'DIAGRAM',
    });

    app.put(
        '/api/admin/diagrams/:diagramId/publishers/:userId',
        { preHandler: adminOnly },
        async (request, reply) => {
            const publisher = canAddPublisher(db, request.params.userId);
            const diagram = db
                .prepare('SELECT 1 FROM diagrams WHERE id = ?')
                .get(request.params.diagramId);
            if (!publisher || !diagram) {
                return reply
                    .code(404)
                    .send({ error: 'Publisher or diagram not found.' });
            }
            transact(db, () => {
                const result = db
                    .prepare(
                        'INSERT OR IGNORE INTO diagram_publishers(diagram_id, user_id) VALUES (?, ?)'
                    )
                    .run(request.params.diagramId, request.params.userId);
                if (result.changes) {
                    appendAudit(db, {
                        actorUserId: request.user.id,
                        action: 'PUBLISHER_ADDED',
                        targetType: 'DIAGRAM',
                        targetId: request.params.diagramId,
                        detail: { userId: request.params.userId },
                    });
                }
            });
            return reply.code(204).send();
        }
    );

    app.delete(
        '/api/admin/diagrams/:diagramId/publishers/:userId',
        { preHandler: adminOnly },
        async (request, reply) => {
            transact(db, () => {
                const result = db
                    .prepare(
                        'DELETE FROM diagram_publishers WHERE diagram_id = ? AND user_id = ?'
                    )
                    .run(request.params.diagramId, request.params.userId);
                if (result.changes) {
                    appendAudit(db, {
                        actorUserId: request.user.id,
                        action: 'PUBLISHER_REMOVED',
                        targetType: 'DIAGRAM',
                        targetId: request.params.diagramId,
                        detail: { userId: request.params.userId },
                    });
                }
            });
            return reply.code(204).send();
        }
    );

    app.get('/api/admin/diagrams', { preHandler: adminOnly }, async () => ({
        // ponytail: small single-company catalog; replace these per-diagram reads
        // with JSON aggregation only if the admin list becomes measurably slow.
        diagrams: db
            .prepare(
                `SELECT d.id, d.name, d.archived_at, d.created_at,
                        u.username AS created_by_username
                 FROM diagrams d
                 JOIN users u ON u.id = d.created_by_user_id
                 ORDER BY d.name COLLATE NOCASE, d.id`
            )
            .all()
            .map((diagram) => adminDiagram(db, diagram)),
    }));
};
