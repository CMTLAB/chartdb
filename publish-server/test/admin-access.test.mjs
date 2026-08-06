import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { canPublishDiagram, canReadDiagram } from '../src/access.mjs';
import { buildApp } from '../src/app.mjs';
import { bootstrapAdmin, migrate, openDatabase } from '../src/db.mjs';
import { hashPassword, hashSecret, verifyPassword } from '../src/security.mjs';

const insertUser = async (db, username, role) => {
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
        `INSERT INTO users(
            id, username, display_name, password_hash, role,
            must_change_password, active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?)`
    ).run(
        id,
        username,
        username,
        await hashPassword('user-password-123'),
        role,
        now,
        now
    );
    return { id, username, role };
};

const setup = async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    await bootstrapAdmin(db, {
        CHARTDB_BOOTSTRAP_ADMIN_USERNAME: 'admin',
        CHARTDB_BOOTSTRAP_ADMIN_PASSWORD: 'temporary-password-123',
    });
    db.prepare(
        "UPDATE users SET must_change_password = 0 WHERE username = 'admin'"
    ).run();
    const admin = db
        .prepare(
            "SELECT id, username, role FROM users WHERE username = 'admin'"
        )
        .get();
    const publisher = await insertUser(db, 'publisher', 'PUBLISHER');
    const coPublisher = await insertUser(db, 'co-publisher', 'PUBLISHER');
    const directViewer = await insertUser(db, 'direct-viewer', 'VIEWER');
    const groupedViewer = await insertUser(db, 'grouped-viewer', 'VIEWER');
    const outsider = await insertUser(db, 'outsider', 'VIEWER');
    const diagramId = randomUUID();
    const groupId = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
        `INSERT INTO diagrams(id, name, created_by_user_id, created_at, updated_at)
         VALUES (?, 'Shared ERD', ?, ?, ?)`
    ).run(diagramId, publisher.id, now, now);
    db.prepare(
        'INSERT INTO diagram_publishers(diagram_id, user_id) VALUES (?, ?), (?, ?)'
    ).run(diagramId, publisher.id, diagramId, coPublisher.id);
    db.prepare(
        'INSERT INTO user_diagram_grants(user_id, diagram_id) VALUES (?, ?)'
    ).run(directViewer.id, diagramId);
    db.prepare('INSERT INTO groups(id, name, created_at) VALUES (?, ?, ?)').run(
        groupId,
        'Readers',
        now
    );
    db.prepare('INSERT INTO user_groups(user_id, group_id) VALUES (?, ?)').run(
        groupedViewer.id,
        groupId
    );
    db.prepare(
        'INSERT INTO group_diagram_grants(group_id, diagram_id) VALUES (?, ?)'
    ).run(groupId, diagramId);
    const app = await buildApp({ db, secureCookies: false });
    return {
        db,
        app,
        admin: { ...admin },
        publisher,
        coPublisher,
        directViewer,
        groupedViewer,
        outsider,
        diagramId,
    };
};

const loginCookie = async (app, username, password) => {
    const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username, password },
    });
    assert.equal(response.statusCode, 200);
    return response.headers['set-cookie'].split(';')[0];
};

const mutationHeaders = (cookie) => ({
    cookie,
    origin: 'http://chartdb.local',
    host: 'chartdb.local',
});

test('read access is admin, publisher, direct grant, or group grant', async () => {
    const context = await setup();
    const {
        db,
        app,
        admin,
        publisher,
        coPublisher,
        directViewer,
        groupedViewer,
        outsider,
        diagramId,
    } = context;

    assert.equal(canReadDiagram(db, admin, diagramId), true);
    assert.equal(canReadDiagram(db, publisher, diagramId), true);
    assert.equal(canReadDiagram(db, coPublisher, diagramId), true);
    assert.equal(canReadDiagram(db, directViewer, diagramId), true);
    assert.equal(canReadDiagram(db, groupedViewer, diagramId), true);
    assert.equal(canReadDiagram(db, outsider, diagramId), false);
    assert.equal(canPublishDiagram(db, publisher, diagramId), true);
    assert.equal(canPublishDiagram(db, directViewer, diagramId), false);
    await app.close();
});

test('admin catalogs include identity and assignment summaries', async () => {
    const { app, admin, diagramId } = await setup();
    const cookie = await loginCookie(
        app,
        admin.username,
        'temporary-password-123'
    );

    const diagrams = await app.inject({
        method: 'GET',
        url: '/api/admin/diagrams',
        headers: { cookie },
    });
    const diagram = diagrams
        .json()
        .diagrams.find((item) => item.id === diagramId);
    assert.equal(diagram.createdByUsername, 'publisher');
    assert.match(diagram.createdAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(diagram.publisherCount, 2);
    assert.equal(diagram.userGrantCount, 1);
    assert.equal(diagram.groupGrantCount, 1);

    const groups = await app.inject({
        method: 'GET',
        url: '/api/admin/groups',
        headers: { cookie },
    });
    assert.equal(groups.json().groups[0].diagramGrantCount, 1);
    await app.close();
});

test('admin replaces all diagram access assignments in one request', async () => {
    const context = await setup();
    const { app, admin, coPublisher, outsider, diagramId, db } = context;
    const cookie = await loginCookie(
        app,
        admin.username,
        'temporary-password-123'
    );
    const groupId = db.prepare('SELECT id FROM groups').get().id;

    const response = await app.inject({
        method: 'PUT',
        url: `/api/admin/diagrams/${diagramId}/access`,
        headers: mutationHeaders(cookie),
        payload: {
            publisherIds: [coPublisher.id],
            userGrantIds: [outsider.id],
            groupGrantIds: [groupId],
        },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().diagram.publisherIds, [coPublisher.id]);
    assert.deepEqual(response.json().diagram.userGrantIds, [outsider.id]);
    assert.deepEqual(response.json().diagram.groupGrantIds, [groupId]);
    await app.close();
});

test('diagram access replacement validates new assignments but accepts existing inactive ones', async () => {
    const context = await setup();
    const { app, admin, coPublisher, directViewer, outsider, diagramId, db } =
        context;
    const cookie = await loginCookie(
        app,
        admin.username,
        'temporary-password-123'
    );
    const groupId = db.prepare('SELECT id FROM groups').get().id;
    db.prepare('UPDATE users SET active = 0 WHERE id IN (?, ?)').run(
        coPublisher.id,
        directViewer.id
    );

    const existing = await app.inject({
        method: 'PUT',
        url: `/api/admin/diagrams/${diagramId}/access`,
        headers: mutationHeaders(cookie),
        payload: {
            publisherIds: [coPublisher.id],
            userGrantIds: [directViewer.id],
            groupGrantIds: [groupId],
        },
    });
    assert.equal(existing.statusCode, 200);

    db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(outsider.id);
    const invalidNewUser = await app.inject({
        method: 'PUT',
        url: `/api/admin/diagrams/${diagramId}/access`,
        headers: mutationHeaders(cookie),
        payload: {
            publisherIds: [coPublisher.id],
            userGrantIds: [directViewer.id, outsider.id],
            groupGrantIds: [groupId],
        },
    });
    assert.equal(invalidNewUser.statusCode, 422);

    const invalidAdminGrant = await app.inject({
        method: 'PUT',
        url: `/api/admin/diagrams/${diagramId}/access`,
        headers: mutationHeaders(cookie),
        payload: {
            publisherIds: [coPublisher.id],
            userGrantIds: [directViewer.id, admin.id],
            groupGrantIds: [groupId],
        },
    });
    assert.equal(invalidAdminGrant.statusCode, 422);

    const duplicate = await app.inject({
        method: 'PUT',
        url: `/api/admin/diagrams/${diagramId}/access`,
        headers: mutationHeaders(cookie),
        payload: {
            publisherIds: [coPublisher.id, coPublisher.id],
            userGrantIds: [],
            groupGrantIds: [],
        },
    });
    assert.equal(duplicate.statusCode, 422);

    const missingGroup = await app.inject({
        method: 'PUT',
        url: `/api/admin/diagrams/${diagramId}/access`,
        headers: mutationHeaders(cookie),
        payload: {
            publisherIds: [coPublisher.id],
            userGrantIds: [directViewer.id],
            groupGrantIds: ['missing-group'],
        },
    });
    assert.equal(missingGroup.statusCode, 422);

    const missingDiagram = await app.inject({
        method: 'PUT',
        url: '/api/admin/diagrams/missing-diagram/access',
        headers: mutationHeaders(cookie),
        payload: {
            publisherIds: [],
            userGrantIds: [],
            groupGrantIds: [],
        },
    });
    assert.equal(missingDiagram.statusCode, 404);
    await app.close();
});

test('diagram access replacement rolls back every assignment on write failure', async () => {
    const context = await setup();
    const { app, admin, coPublisher, outsider, diagramId, db } = context;
    const cookie = await loginCookie(
        app,
        admin.username,
        'temporary-password-123'
    );
    const rows = (table, column) =>
        db
            .prepare(
                `SELECT ${column} AS id FROM ${table} WHERE diagram_id = ? ORDER BY ${column}`
            )
            .all(diagramId);
    const before = {
        publishers: rows('diagram_publishers', 'user_id'),
        users: rows('user_diagram_grants', 'user_id'),
        groups: rows('group_diagram_grants', 'group_id'),
    };
    db.exec(`CREATE TRIGGER reject_direct_grant
             BEFORE INSERT ON user_diagram_grants
             BEGIN SELECT RAISE(ABORT, 'forced failure'); END`);

    const response = await app.inject({
        method: 'PUT',
        url: `/api/admin/diagrams/${diagramId}/access`,
        headers: mutationHeaders(cookie),
        payload: {
            publisherIds: [coPublisher.id],
            userGrantIds: [outsider.id],
            groupGrantIds: [],
        },
    });

    assert.equal(response.statusCode, 500);
    assert.deepEqual(rows('diagram_publishers', 'user_id'), before.publishers);
    assert.deepEqual(rows('user_diagram_grants', 'user_id'), before.users);
    assert.deepEqual(rows('group_diagram_grants', 'group_id'), before.groups);
    await app.close();
});

test('admin replaces group members and preserves existing inactive members', async () => {
    const context = await setup();
    const { app, admin, groupedViewer, directViewer, outsider, db } = context;
    const cookie = await loginCookie(
        app,
        admin.username,
        'temporary-password-123'
    );
    const groupId = db.prepare('SELECT id FROM groups').get().id;
    db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(
        groupedViewer.id
    );

    const kept = await app.inject({
        method: 'PUT',
        url: `/api/admin/groups/${groupId}/members`,
        headers: mutationHeaders(cookie),
        payload: { userIds: [groupedViewer.id, outsider.id] },
    });
    assert.equal(kept.statusCode, 200);
    assert.deepEqual(
        kept.json().group.userIds.sort(),
        [groupedViewer.id, outsider.id].sort()
    );

    db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(directViewer.id);
    const invalidNewMember = await app.inject({
        method: 'PUT',
        url: `/api/admin/groups/${groupId}/members`,
        headers: mutationHeaders(cookie),
        payload: { userIds: [outsider.id, directViewer.id] },
    });
    assert.equal(invalidNewMember.statusCode, 422);
    assert.deepEqual(
        db
            .prepare(
                'SELECT user_id FROM user_groups WHERE group_id = ? ORDER BY user_id'
            )
            .all(groupId)
            .map((row) => row.user_id),
        [groupedViewer.id, outsider.id].sort()
    );

    const removed = await app.inject({
        method: 'PUT',
        url: `/api/admin/groups/${groupId}/members`,
        headers: mutationHeaders(cookie),
        payload: { userIds: [outsider.id] },
    });
    assert.equal(removed.statusCode, 200);
    assert.deepEqual(removed.json().group.userIds, [outsider.id]);

    const duplicate = await app.inject({
        method: 'PUT',
        url: `/api/admin/groups/${groupId}/members`,
        headers: mutationHeaders(cookie),
        payload: { userIds: [outsider.id, outsider.id] },
    });
    assert.equal(duplicate.statusCode, 422);

    const missingGroup = await app.inject({
        method: 'PUT',
        url: '/api/admin/groups/missing-group/members',
        headers: mutationHeaders(cookie),
        payload: { userIds: [] },
    });
    assert.equal(missingGroup.statusCode, 404);
    await app.close();
});

test('group member replacement rolls back on write failure', async () => {
    const context = await setup();
    const { app, admin, outsider, db } = context;
    const cookie = await loginCookie(
        app,
        admin.username,
        'temporary-password-123'
    );
    const groupId = db.prepare('SELECT id FROM groups').get().id;
    const members = () =>
        db
            .prepare(
                'SELECT user_id FROM user_groups WHERE group_id = ? ORDER BY user_id'
            )
            .all(groupId);
    const before = members();
    db.exec(`CREATE TRIGGER reject_group_member
             BEFORE INSERT ON user_groups
             BEGIN SELECT RAISE(ABORT, 'forced failure'); END`);

    const response = await app.inject({
        method: 'PUT',
        url: `/api/admin/groups/${groupId}/members`,
        headers: mutationHeaders(cookie),
        payload: { userIds: [outsider.id] },
    });

    assert.equal(response.statusCode, 500);
    assert.deepEqual(members(), before);
    await app.close();
});

test('compatibility assignment routes enforce new-assignment policy but allow cleanup', async () => {
    const { app, admin, outsider, diagramId, db } = await setup();
    const cookie = await loginCookie(
        app,
        admin.username,
        'temporary-password-123'
    );
    const groupId = db.prepare('SELECT id FROM groups').get().id;
    db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(outsider.id);

    const inactiveGroupMember = await app.inject({
        method: 'PUT',
        url: `/api/admin/groups/${groupId}/users/${outsider.id}`,
        headers: mutationHeaders(cookie),
    });
    assert.equal(inactiveGroupMember.statusCode, 422);

    const adminDirectGrant = await app.inject({
        method: 'PUT',
        url: `/api/admin/diagrams/${diagramId}/user-grants/${admin.id}`,
        headers: mutationHeaders(cookie),
    });
    assert.equal(adminDirectGrant.statusCode, 422);

    db.prepare(
        'INSERT INTO user_diagram_grants(diagram_id, user_id) VALUES (?, ?)'
    ).run(diagramId, admin.id);
    const cleanup = await app.inject({
        method: 'DELETE',
        url: `/api/admin/diagrams/${diagramId}/user-grants/${admin.id}`,
        headers: mutationHeaders(cookie),
    });
    assert.equal(cleanup.statusCode, 204);
    assert.equal(
        db
            .prepare(
                'SELECT COUNT(*) AS count FROM user_diagram_grants WHERE diagram_id = ? AND user_id = ?'
            )
            .get(diagramId, admin.id).count,
        0
    );
    await app.close();
});

test('admin mutations append actor and safe details to the audit log', async () => {
    const { app, admin, coPublisher, directViewer, outsider, diagramId, db } =
        await setup();
    const cookie = await loginCookie(
        app,
        admin.username,
        'temporary-password-123'
    );
    const headers = mutationHeaders(cookie);
    const groupId = db.prepare('SELECT id FROM groups').get().id;

    await app.inject({
        method: 'PUT',
        url: `/api/admin/diagrams/${diagramId}/access`,
        headers,
        payload: {
            publisherIds: [coPublisher.id],
            userGrantIds: [outsider.id],
            groupGrantIds: [groupId],
        },
    });
    await app.inject({
        method: 'PUT',
        url: `/api/admin/groups/${groupId}/members`,
        headers,
        payload: { userIds: [outsider.id] },
    });
    const createdUser = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        headers,
        payload: {
            username: 'audited-user',
            displayName: 'Audited User',
            role: 'VIEWER',
            temporaryPassword: 'never-log-this-password',
        },
    });
    assert.equal(createdUser.statusCode, 201);
    const userId = createdUser.json().user.id;
    await app.inject({
        method: 'PATCH',
        url: `/api/admin/users/${userId}`,
        headers,
        payload: {
            role: 'PUBLISHER',
            temporaryPassword: 'another-never-log-this-password',
        },
    });
    const createdGroup = await app.inject({
        method: 'POST',
        url: '/api/admin/groups',
        headers,
        payload: { name: 'Audited Group' },
    });
    assert.equal(createdGroup.statusCode, 201);
    await app.inject({
        method: 'DELETE',
        url: `/api/admin/groups/${createdGroup.json().group.id}`,
        headers,
    });
    await app.inject({
        method: 'PUT',
        url: `/api/admin/groups/${groupId}/users/${directViewer.id}`,
        headers,
    });
    await app.inject({
        method: 'DELETE',
        url: `/api/admin/groups/${groupId}/users/${directViewer.id}`,
        headers,
    });
    await app.inject({
        method: 'PUT',
        url: `/api/admin/diagrams/${diagramId}/publishers/${userId}`,
        headers,
    });
    await app.inject({
        method: 'DELETE',
        url: `/api/admin/diagrams/${diagramId}/publishers/${userId}`,
        headers,
    });

    const rows = db
        .prepare(
            `SELECT action, actor_user_id, target_id, detail_json
             FROM audit_log ORDER BY rowid`
        )
        .all();
    assert.deepEqual(
        rows.map((row) => row.action),
        [
            'DIAGRAM_ACCESS_REPLACED',
            'GROUP_MEMBERS_REPLACED',
            'USER_CREATED',
            'USER_UPDATED',
            'GROUP_CREATED',
            'GROUP_DELETED',
            'ASSIGNMENT_ADDED',
            'ASSIGNMENT_REMOVED',
            'PUBLISHER_ADDED',
            'PUBLISHER_REMOVED',
        ]
    );
    assert.equal(
        rows.every((row) => row.actor_user_id === admin.id),
        true
    );
    assert.equal(
        rows.some((row) => row.detail_json.includes('never-log-this-password')),
        false
    );
    assert.equal(
        rows.some((row) =>
            row.detail_json.includes('another-never-log-this-password')
        ),
        false
    );
    const userUpdated = rows.find((row) => row.action === 'USER_UPDATED');
    assert.equal(JSON.parse(userUpdated.detail_json).passwordReset, true);
    const accessDetail = JSON.parse(rows[0].detail_json);
    assert.deepEqual(accessDetail.after.publisherIds, [coPublisher.id]);
    assert.deepEqual(accessDetail.after.userGrantIds, [outsider.id]);
    assert.deepEqual(accessDetail.after.groupGrantIds, [groupId]);
    await app.close();
});

test('diagram access replacement rolls back when audit recording fails', async () => {
    const { app, admin, coPublisher, outsider, diagramId, db } = await setup();
    const cookie = await loginCookie(
        app,
        admin.username,
        'temporary-password-123'
    );
    const rows = (table, column) =>
        db
            .prepare(
                `SELECT ${column} AS id FROM ${table} WHERE diagram_id = ? ORDER BY ${column}`
            )
            .all(diagramId);
    const before = {
        publishers: rows('diagram_publishers', 'user_id'),
        users: rows('user_diagram_grants', 'user_id'),
        groups: rows('group_diagram_grants', 'group_id'),
    };
    db.exec(`CREATE TRIGGER reject_audit
             BEFORE INSERT ON audit_log
             BEGIN SELECT RAISE(ABORT, 'forced audit failure'); END`);

    const response = await app.inject({
        method: 'PUT',
        url: `/api/admin/diagrams/${diagramId}/access`,
        headers: mutationHeaders(cookie),
        payload: {
            publisherIds: [coPublisher.id],
            userGrantIds: [outsider.id],
            groupGrantIds: [],
        },
    });

    assert.equal(response.statusCode, 500);
    assert.deepEqual(rows('diagram_publishers', 'user_id'), before.publishers);
    assert.deepEqual(rows('user_diagram_grants', 'user_id'), before.users);
    assert.deepEqual(rows('group_diagram_grants', 'group_id'), before.groups);
    assert.equal(
        db.prepare('SELECT COUNT(*) AS count FROM audit_log').get().count,
        0
    );
    await app.close();
});

test('only an admin can create users and assign co-publishers', async () => {
    const { app, admin, publisher, diagramId } = await setup();
    const adminCookie = await loginCookie(
        app,
        admin.username,
        'temporary-password-123'
    );
    const publisherCookie = await loginCookie(
        app,
        publisher.username,
        'user-password-123'
    );

    const denied = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        headers: mutationHeaders(publisherCookie),
        payload: {
            username: 'new-viewer',
            displayName: 'New Viewer',
            role: 'VIEWER',
            temporaryPassword: 'temporary-password-123',
        },
    });
    assert.equal(denied.statusCode, 403);

    const created = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        headers: mutationHeaders(adminCookie),
        payload: {
            username: 'new-publisher',
            displayName: 'New Publisher',
            role: 'PUBLISHER',
            temporaryPassword: 'temporary-password-123',
        },
    });
    assert.equal(created.statusCode, 201);
    assert.equal(created.json().user.mustChangePassword, true);

    const assigned = await app.inject({
        method: 'PUT',
        url: `/api/admin/diagrams/${diagramId}/publishers/${created.json().user.id}`,
        headers: mutationHeaders(adminCookie),
    });
    assert.equal(assigned.statusCode, 204);
    await app.close();
});

test('admin creates, lists, and updates an optional user department', async () => {
    const { app, admin } = await setup();
    const cookie = await loginCookie(
        app,
        admin.username,
        'temporary-password-123'
    );
    const headers = mutationHeaders(cookie);
    const created = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        headers,
        payload: {
            username: 'department-user',
            displayName: 'Department User',
            department: '  Data Platform  ',
            role: 'VIEWER',
            temporaryPassword: 'temporary-password-123',
        },
    });
    assert.equal(created.statusCode, 201);
    assert.equal(created.json().user.department, 'Data Platform');

    const updated = await app.inject({
        method: 'PATCH',
        url: `/api/admin/users/${created.json().user.id}`,
        headers,
        payload: { department: 'Finance' },
    });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.json().user.department, 'Finance');

    const listed = await app.inject({
        method: 'GET',
        url: '/api/admin/users',
        headers: { cookie },
    });
    assert.equal(
        listed.json().users.find((user) => user.id === created.json().user.id)
            .department,
        'Finance'
    );

    const cleared = await app.inject({
        method: 'PATCH',
        url: `/api/admin/users/${created.json().user.id}`,
        headers,
        payload: { department: '   ' },
    });
    assert.equal(cleared.statusCode, 200);
    assert.equal(cleared.json().user.department, null);
    await app.close();
});

test('admin password reset revokes sessions and forces the next-login change flow', async () => {
    const { app, db, admin, publisher } = await setup();
    const adminCookie = await loginCookie(
        app,
        admin.username,
        'temporary-password-123'
    );
    await loginCookie(app, publisher.username, 'user-password-123');
    const reset = await app.inject({
        method: 'PATCH',
        url: `/api/admin/users/${publisher.id}`,
        headers: mutationHeaders(adminCookie),
        payload: { temporaryPassword: 'replacement-password-123' },
    });
    assert.equal(reset.statusCode, 200);
    assert.equal(reset.json().user.mustChangePassword, true);
    const stored = db
        .prepare(
            'SELECT password_hash, must_change_password FROM users WHERE id = ?'
        )
        .get(publisher.id);
    assert.equal(stored.must_change_password, 1);
    assert.equal(
        await verifyPassword('replacement-password-123', stored.password_hash),
        true
    );
    assert.equal(
        db
            .prepare('SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?')
            .get(publisher.id).count,
        0
    );
    const login = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
            username: publisher.username,
            password: 'replacement-password-123',
        },
    });
    assert.equal(login.statusCode, 200);
    assert.equal(login.json().user.mustChangePassword, true);
    const blocked = await app.inject({
        method: 'GET',
        url: '/api/diagrams',
        headers: { cookie: login.headers['set-cookie'].split(';')[0] },
    });
    assert.equal(blocked.statusCode, 403);
    await app.close();
});

test('disabling a user revokes sessions and API tokens without deleting version history', async () => {
    const { app, db, admin, publisher, diagramId } = await setup();
    const adminCookie = await loginCookie(
        app,
        admin.username,
        'temporary-password-123'
    );
    await loginCookie(app, publisher.username, 'user-password-123');
    const tokenId = randomUUID();
    db.prepare(
        `INSERT INTO api_tokens(
            id, token_hash, owner_user_id, label, created_at
         ) VALUES (?, ?, ?, 'CI', ?)`
    ).run(
        tokenId,
        hashSecret('publisher-token'),
        publisher.id,
        new Date().toISOString()
    );
    db.prepare(
        `INSERT INTO diagram_versions(
            id, diagram_id, version_no, content_json, changed_by_user_id,
            api_token_id, source, created_at
         ) VALUES (?, ?, 1, '{}', ?, ?, 'API_TOKEN', ?)`
    ).run(
        randomUUID(),
        diagramId,
        publisher.id,
        tokenId,
        new Date().toISOString()
    );

    const response = await app.inject({
        method: 'PATCH',
        url: `/api/admin/users/${publisher.id}`,
        headers: mutationHeaders(adminCookie),
        payload: { active: false },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(
        db
            .prepare('SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?')
            .get(publisher.id).count,
        0
    );
    assert.equal(
        db
            .prepare(
                `SELECT COUNT(*) AS count FROM api_tokens
                 WHERE owner_user_id = ? AND revoked_at IS NOT NULL`
            )
            .get(publisher.id).count,
        1
    );
    assert.equal(
        db
            .prepare(
                'SELECT COUNT(*) AS count FROM diagram_versions WHERE api_token_id = ?'
            )
            .get(tokenId).count,
        1
    );
    await app.close();
});

test('removing the publisher role revokes existing API tokens', async () => {
    const { app, db, admin, publisher } = await setup();
    const adminCookie = await loginCookie(
        app,
        admin.username,
        'temporary-password-123'
    );
    db.prepare('DELETE FROM diagram_publishers WHERE user_id = ?').run(
        publisher.id
    );
    db.prepare(
        `INSERT INTO api_tokens(
            id, token_hash, owner_user_id, label, created_at
         ) VALUES (?, ?, ?, 'CI', ?)`
    ).run(
        randomUUID(),
        hashSecret('publisher-token'),
        publisher.id,
        new Date().toISOString()
    );

    const response = await app.inject({
        method: 'PATCH',
        url: `/api/admin/users/${publisher.id}`,
        headers: mutationHeaders(adminCookie),
        payload: { role: 'VIEWER' },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(
        db
            .prepare(
                `SELECT COUNT(*) AS count FROM api_tokens
                 WHERE owner_user_id = ? AND revoked_at IS NOT NULL`
            )
            .get(publisher.id).count,
        1
    );
    await app.close();
});

test('admin lists token owners without receiving token secrets or hashes', async () => {
    const { app, db, admin, publisher } = await setup();
    const adminCookie = await loginCookie(
        app,
        admin.username,
        'temporary-password-123'
    );
    const publisherCookie = await loginCookie(
        app,
        publisher.username,
        'user-password-123'
    );
    db.prepare(
        'UPDATE users SET display_name = ?, department = ? WHERE id = ?'
    ).run('Publisher Kim', 'Data Platform', publisher.id);
    const storedHash = hashSecret('cdb_admin-list-secret');
    db.prepare(
        `INSERT INTO api_tokens(
            id, token_hash, owner_user_id, label, created_at
         ) VALUES ('admin-list-token', ?, ?, 'nightly-import', ?)`
    ).run(storedHash, publisher.id, '2026-08-06T00:00:00.000Z');

    const listed = await app.inject({
        method: 'GET',
        url: '/api/admin/tokens',
        headers: { cookie: adminCookie },
    });
    assert.equal(listed.statusCode, 200);
    assert.deepEqual(listed.json().tokens[0].owner, {
        id: publisher.id,
        username: publisher.username,
        displayName: 'Publisher Kim',
        department: 'Data Platform',
        active: true,
    });
    assert.equal(listed.json().tokens[0].label, 'nightly-import');
    assert.equal(JSON.stringify(listed.json()).includes(storedHash), false);
    assert.equal('tokenHash' in listed.json().tokens[0], false);

    const denied = await app.inject({
        method: 'GET',
        url: '/api/admin/tokens',
        headers: { cookie: publisherCookie },
    });
    assert.equal(denied.statusCode, 403);
    await app.close();
});

test('admin revokes a token atomically with safe audit detail', async () => {
    const { app, db, admin, publisher, diagramId } = await setup();
    const adminCookie = await loginCookie(
        app,
        admin.username,
        'temporary-password-123'
    );
    const publisherCookie = await loginCookie(
        app,
        publisher.username,
        'user-password-123'
    );
    const created = await app.inject({
        method: 'POST',
        url: '/api/tokens',
        headers: mutationHeaders(publisherCookie),
        payload: { label: 'admin-revoke' },
    });
    const tokenId = created.json().item.id;
    const plaintext = created.json().token;

    const versionPayload = {
        diagram: {
            id: 'token-test',
            name: 'Shared ERD',
            databaseType: 'postgresql',
            tables: [],
            relationships: [],
            dependencies: [],
            areas: [],
            customTypes: [],
            notes: [],
        },
    };
    const before = await app.inject({
        method: 'POST',
        url: `/api/diagrams/${diagramId}/versions`,
        headers: { authorization: `Bearer ${plaintext}` },
        payload: versionPayload,
    });
    assert.equal(before.statusCode, 201);

    const denied = await app.inject({
        method: 'DELETE',
        url: `/api/admin/tokens/${tokenId}`,
        headers: mutationHeaders(publisherCookie),
    });
    assert.equal(denied.statusCode, 403);

    const revoked = await app.inject({
        method: 'DELETE',
        url: `/api/admin/tokens/${tokenId}`,
        headers: mutationHeaders(adminCookie),
    });
    assert.equal(revoked.statusCode, 204);

    const after = await app.inject({
        method: 'POST',
        url: `/api/diagrams/${diagramId}/versions`,
        headers: { authorization: `Bearer ${plaintext}` },
        payload: versionPayload,
    });
    assert.equal(after.statusCode, 401);
    const audit = db
        .prepare(
            `SELECT action, target_type, target_id, detail_json
             FROM audit_log WHERE action = 'API_TOKEN_REVOKED'`
        )
        .get();
    assert.equal(audit.target_type, 'API_TOKEN');
    assert.equal(audit.target_id, tokenId);
    assert.deepEqual(JSON.parse(audit.detail_json), {
        label: 'admin-revoke',
        ownerUserId: publisher.id,
        ownerUsername: publisher.username,
    });
    assert.equal(audit.detail_json.includes(plaintext), false);

    const repeated = await app.inject({
        method: 'DELETE',
        url: `/api/admin/tokens/${tokenId}`,
        headers: mutationHeaders(adminCookie),
    });
    assert.equal(repeated.statusCode, 404);
    await app.close();
});

test('admin and token routes reject non-string fields without returning 500', async () => {
    const { app, admin, publisher } = await setup();
    const adminCookie = await loginCookie(
        app,
        admin.username,
        'temporary-password-123'
    );
    const publisherCookie = await loginCookie(
        app,
        publisher.username,
        'user-password-123'
    );
    const group = await app.inject({
        method: 'POST',
        url: '/api/admin/groups',
        headers: mutationHeaders(adminCookie),
        payload: { name: { value: 'Readers' } },
    });
    const user = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        headers: mutationHeaders(adminCookie),
        payload: {
            username: { value: 'new-viewer' },
            displayName: { value: 'New Viewer' },
            role: 'VIEWER',
            temporaryPassword: 'temporary-password-123',
        },
    });
    const patchedUser = await app.inject({
        method: 'PATCH',
        url: `/api/admin/users/${publisher.id}`,
        headers: mutationHeaders(adminCookie),
        payload: { displayName: { value: 'Publisher' } },
    });
    const token = await app.inject({
        method: 'POST',
        url: '/api/tokens',
        headers: mutationHeaders(publisherCookie),
        payload: { label: { value: 'CI' } },
    });

    assert.equal(group.statusCode, 422);
    assert.equal(user.statusCode, 422);
    assert.equal(patchedUser.statusCode, 422);
    assert.equal(token.statusCode, 422);
    await app.close();
});
