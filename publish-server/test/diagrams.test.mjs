import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { buildApp } from '../src/app.mjs';
import { bootstrapAdmin, migrate, openDatabase } from '../src/db.mjs';
import { hashPassword } from '../src/security.mjs';

const diagram = (name, marker) => ({
    id: `local-${marker}`,
    name,
    databaseType: 'postgresql',
    tables: [],
    relationships: [],
    dependencies: [],
    areas: [],
    customTypes: [],
    notes: [{ id: `note-${marker}`, content: marker }],
});

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
    const publisher = await insertUser(db, 'publisher', 'PUBLISHER');
    const coPublisher = await insertUser(db, 'co-publisher', 'PUBLISHER');
    const outsider = await insertUser(db, 'outsider', 'VIEWER');
    const app = await buildApp({ db, secureCookies: false });
    return { db, app, publisher, coPublisher, outsider };
};

const cookieFor = async (app, username, password = 'user-password-123') => {
    const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username, password },
    });
    assert.equal(response.statusCode, 200);
    return response.headers['set-cookie'].split(';')[0];
};

const getHeaders = (cookie) => ({ cookie });
const mutationHeaders = (cookie) => ({
    cookie,
    origin: 'http://chartdb.local',
    host: 'chartdb.local',
});

test('two assigned publishers create sequential immutable versions with actors', async () => {
    const { app, db, publisher, coPublisher } = await setup();
    const publisherCookie = await cookieFor(app, publisher.username);
    const coPublisherCookie = await cookieFor(app, coPublisher.username);

    const created = await app.inject({
        method: 'POST',
        url: '/api/diagrams',
        headers: mutationHeaders(publisherCookie),
        payload: { diagram: diagram('Team ERD', 'one'), changeNote: 'Initial' },
    });
    assert.equal(created.statusCode, 201);
    assert.equal(created.json().version, 1);
    const diagramId = created.json().id;
    db.prepare(
        'INSERT INTO diagram_publishers(diagram_id, user_id) VALUES (?, ?)'
    ).run(diagramId, coPublisher.id);

    const second = await app.inject({
        method: 'POST',
        url: `/api/diagrams/${diagramId}/versions`,
        headers: mutationHeaders(publisherCookie),
        payload: { diagram: diagram('Team ERD', 'two') },
    });
    const third = await app.inject({
        method: 'POST',
        url: `/api/diagrams/${diagramId}/versions`,
        headers: mutationHeaders(coPublisherCookie),
        payload: { diagram: diagram('Team ERD', 'three') },
    });

    assert.equal(second.json().version, 2);
    assert.equal(third.json().version, 3);
    const rows = db
        .prepare(
            `SELECT version_no, content_json, changed_by_user_id
             FROM diagram_versions WHERE diagram_id = ? ORDER BY version_no`
        )
        .all(diagramId);
    assert.deepEqual(
        rows.map((row) => row.changed_by_user_id),
        [publisher.id, publisher.id, coPublisher.id]
    );
    assert.equal(JSON.parse(rows[0].content_json).notes[0].content, 'one');
    assert.equal(JSON.parse(rows[2].content_json).notes[0].content, 'three');
    await app.close();
});

test('an inaccessible diagram returns 404 instead of leaking its existence', async () => {
    const { app, publisher, outsider } = await setup();
    const publisherCookie = await cookieFor(app, publisher.username);
    const outsiderCookie = await cookieFor(app, outsider.username);
    const created = await app.inject({
        method: 'POST',
        url: '/api/diagrams',
        headers: mutationHeaders(publisherCookie),
        payload: { diagram: diagram('Private ERD', 'private') },
    });
    assert.equal(created.statusCode, 201);

    const response = await app.inject({
        method: 'GET',
        url: `/api/diagrams/${created.json().id}`,
        headers: getHeaders(outsiderCookie),
    });

    assert.equal(response.statusCode, 404);

    const deniedPublish = await app.inject({
        method: 'POST',
        url: `/api/diagrams/${created.json().id}/versions`,
        headers: {
            ...mutationHeaders(outsiderCookie),
            'content-type': 'application/json',
        },
        payload: '{"diagram":',
    });
    assert.equal(deniedPublish.statusCode, 404);
    await app.close();
});

test('publish routes authenticate before parsing JSON', async () => {
    const { app } = await setup();
    const response = await app.inject({
        method: 'POST',
        url: '/api/diagrams',
        headers: { 'content-type': 'application/json' },
        payload: '{"diagram":',
    });

    assert.equal(response.statusCode, 401);
    await app.close();
});

test('restoring an old version creates a new current version without changing history', async () => {
    const { app, publisher } = await setup();
    const cookie = await cookieFor(app, publisher.username);
    const created = await app.inject({
        method: 'POST',
        url: '/api/diagrams',
        headers: mutationHeaders(cookie),
        payload: { diagram: diagram('Restore ERD', 'one') },
    });
    const diagramId = created.json().id;
    await app.inject({
        method: 'POST',
        url: `/api/diagrams/${diagramId}/versions`,
        headers: mutationHeaders(cookie),
        payload: { diagram: diagram('Restore ERD', 'two') },
    });

    const restored = await app.inject({
        method: 'POST',
        url: `/api/diagrams/${diagramId}/versions/1/restore`,
        headers: mutationHeaders(cookie),
    });
    const current = await app.inject({
        method: 'GET',
        url: `/api/diagrams/${diagramId}`,
        headers: getHeaders(cookie),
    });

    assert.equal(restored.statusCode, 201);
    assert.equal(restored.json().version, 3);
    assert.equal(current.json().diagram.notes[0].content, 'one');
    const history = await app.inject({
        method: 'GET',
        url: `/api/diagrams/${diagramId}/versions`,
        headers: getHeaders(cookie),
    });
    assert.deepEqual(
        history.json().versions.map((version) => version.source),
        ['RESTORE', 'WEB', 'WEB']
    );
    await app.close();
});

test('publisher API tokens are shown once and can publish metadata only to assigned diagrams', async () => {
    const { app, publisher, outsider } = await setup();
    const publisherCookie = await cookieFor(app, publisher.username);
    const created = await app.inject({
        method: 'POST',
        url: '/api/diagrams',
        headers: mutationHeaders(publisherCookie),
        payload: { diagram: diagram('Metadata ERD', 'initial') },
    });
    const tokenResponse = await app.inject({
        method: 'POST',
        url: '/api/tokens',
        headers: mutationHeaders(publisherCookie),
        payload: { label: 'nightly CI' },
    });
    assert.equal(tokenResponse.statusCode, 201);
    assert.equal(typeof tokenResponse.json().token, 'string');
    const token = tokenResponse.json().token;

    const listed = await app.inject({
        method: 'GET',
        url: '/api/tokens',
        headers: getHeaders(publisherCookie),
    });
    assert.equal(listed.statusCode, 200);
    assert.equal('token' in listed.json().tokens[0], false);

    const published = await app.inject({
        method: 'POST',
        url: `/api/diagrams/${created.json().id}/metadata`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
            databaseType: 'postgresql',
            metadata: {
                fk_info: [],
                pk_info: [],
                columns: [],
                indexes: [],
                tables: [],
                views: [],
                database_name: 'empty',
                version: '1',
            },
        },
    });
    assert.equal(published.statusCode, 201);
    assert.equal(published.json().version, 2);

    const outsiderCookie = await cookieFor(app, outsider.username);
    const outsiderToken = await app.inject({
        method: 'POST',
        url: '/api/tokens',
        headers: mutationHeaders(outsiderCookie),
        payload: { label: 'not allowed' },
    });
    assert.equal(outsiderToken.statusCode, 403);
    await app.close();
});
