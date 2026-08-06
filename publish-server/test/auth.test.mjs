import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildApp } from '../src/app.mjs';
import { bootstrapAdmin, migrate, openDatabase } from '../src/db.mjs';
import { resetAdminPassword } from '../src/reset-password.mjs';

const createApp = async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    await bootstrapAdmin(db, {
        CHARTDB_BOOTSTRAP_ADMIN_USERNAME: 'admin',
        CHARTDB_BOOTSTRAP_ADMIN_PASSWORD: 'temporary-password-123',
    });
    return { db, app: await buildApp({ db, secureCookies: false }) };
};

const login = async (app, password = 'temporary-password-123') =>
    app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'admin', password },
    });

const requestCookie = (response) =>
    response.headers['set-cookie'].split(';')[0];

test('login sets an HttpOnly session and me returns the active user', async () => {
    const { app } = await createApp();

    const response = await login(app);

    assert.equal(response.statusCode, 200);
    assert.match(response.headers['set-cookie'], /HttpOnly/);
    assert.match(response.headers['set-cookie'], /SameSite=Lax/);
    const me = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { cookie: requestCookie(response) },
    });
    assert.equal(me.statusCode, 200);
    assert.deepEqual(me.json().user, {
        id: me.json().user.id,
        username: 'admin',
        displayName: 'admin',
        role: 'ADMIN',
        mustChangePassword: true,
    });
    await app.close();
});

test('me rejects requests without a valid session', async () => {
    const { app } = await createApp();

    const response = await app.inject({ method: 'GET', url: '/api/auth/me' });

    assert.equal(response.statusCode, 401);
    await app.close();
});

test('password change requires same origin, revokes the old session, and clears forced change', async () => {
    const { app } = await createApp();
    const signedIn = await login(app);
    const cookie = requestCookie(signedIn);

    const crossSite = await app.inject({
        method: 'POST',
        url: '/api/auth/change-password',
        headers: {
            cookie,
            origin: 'https://evil.example',
            host: 'chartdb.local',
        },
        payload: {
            currentPassword: 'temporary-password-123',
            newPassword: 'replacement-password-123',
        },
    });
    assert.equal(crossSite.statusCode, 403);

    const changed = await app.inject({
        method: 'POST',
        url: '/api/auth/change-password',
        headers: {
            cookie,
            origin: 'http://chartdb.local',
            host: 'chartdb.local',
        },
        payload: {
            currentPassword: 'temporary-password-123',
            newPassword: 'replacement-password-123',
        },
    });
    assert.equal(changed.statusCode, 204);

    const oldSession = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { cookie },
    });
    assert.equal(oldSession.statusCode, 401);
    assert.equal((await login(app)).statusCode, 401);
    const newLogin = await login(app, 'replacement-password-123');
    assert.equal(newLogin.statusCode, 200);
    assert.equal(newLogin.json().user.mustChangePassword, false);
    await app.close();
});

test('resetAdminPassword revokes sessions and forces another password change', async () => {
    const { app, db } = await createApp();
    const signedIn = await login(app);
    assert.equal(
        db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count,
        1
    );

    await resetAdminPassword(db, 'admin', 'reset-password-12345');

    assert.equal(
        db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count,
        0
    );
    assert.equal(
        db
            .prepare(
                "SELECT must_change_password FROM users WHERE username = 'admin'"
            )
            .get().must_change_password,
        1
    );
    assert.equal(
        (
            await app.inject({
                method: 'GET',
                url: '/api/auth/me',
                headers: { cookie: requestCookie(signedIn) },
            })
        ).statusCode,
        401
    );
    assert.equal((await login(app, 'reset-password-12345')).statusCode, 200);
    await app.close();
});

test('repeated invalid logins are rate limited per IP', async () => {
    const { app } = await createApp();

    for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await login(app, 'wrong-password');
        assert.equal(response.statusCode, 401);
    }
    const blocked = await login(app, 'wrong-password');

    assert.equal(blocked.statusCode, 429);
    await app.close();
});

test('ordinary API routes reject request bodies larger than 256KB', async () => {
    const { app } = await createApp();
    const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
            username: 'a'.repeat(256 * 1024),
            password: 'wrong-password',
        },
    });

    assert.equal(response.statusCode, 413);
    await app.close();
});

test('login rejects non-string credentials without returning 500', async () => {
    const { app } = await createApp();
    const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: { value: 'admin' }, password: 1234 },
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), {
        error: 'Invalid username or password.',
    });
    await app.close();
});

test('unknown and known usernames use the same login error', async () => {
    const { app } = await createApp();
    const unknown = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'missing', password: 'wrong-password' },
    });
    const known = await login(app, 'wrong-password');

    assert.equal(unknown.statusCode, 401);
    assert.deepEqual(unknown.json(), known.json());
    await app.close();
});
