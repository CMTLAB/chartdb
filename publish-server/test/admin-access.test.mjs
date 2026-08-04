import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { canPublishDiagram, canReadDiagram } from '../src/access.mjs';
import { buildApp } from '../src/app.mjs';
import { bootstrapAdmin, migrate, openDatabase } from '../src/db.mjs';
import { hashPassword, hashSecret } from '../src/security.mjs';

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
