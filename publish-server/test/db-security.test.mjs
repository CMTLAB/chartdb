import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bootstrapAdmin, migrate, openDatabase } from '../src/db.mjs';
import {
    hashPassword,
    hashSecret,
    newSecret,
    verifyPassword,
} from '../src/security.mjs';

test('migrates an empty database and bootstraps one forced-change admin', async () => {
    const db = openDatabase(':memory:');
    migrate(db);

    await bootstrapAdmin(db, {
        CHARTDB_BOOTSTRAP_ADMIN_USERNAME: 'admin',
        CHARTDB_BOOTSTRAP_ADMIN_PASSWORD: 'temporary-password-123',
    });

    const user = db
        .prepare('SELECT username, role, must_change_password FROM users')
        .get();
    assert.deepEqual(
        { ...user },
        {
            username: 'admin',
            role: 'ADMIN',
            must_change_password: 1,
        }
    );
});

test('bootstrap refuses an empty database without credentials', async () => {
    const db = openDatabase(':memory:');
    migrate(db);

    await assert.rejects(
        bootstrapAdmin(db, {}),
        /bootstrap administrator credentials/i
    );
});

test('bootstrap never overwrites an existing administrator', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    await bootstrapAdmin(db, {
        CHARTDB_BOOTSTRAP_ADMIN_USERNAME: 'admin',
        CHARTDB_BOOTSTRAP_ADMIN_PASSWORD: 'temporary-password-123',
    });

    await bootstrapAdmin(db, {
        CHARTDB_BOOTSTRAP_ADMIN_USERNAME: 'replacement',
        CHARTDB_BOOTSTRAP_ADMIN_PASSWORD: 'different-password-123',
    });

    assert.equal(
        db.prepare('SELECT COUNT(*) AS count FROM users').get().count,
        1
    );
    assert.equal(
        db.prepare('SELECT username FROM users').get().username,
        'admin'
    );
});

test('password and opaque token hashes verify without storing plaintext', async () => {
    const encoded = await hashPassword('correct horse battery staple');

    assert.equal(
        await verifyPassword('correct horse battery staple', encoded),
        true
    );
    assert.equal(await verifyPassword('wrong', encoded), false);

    const secret = newSecret();
    assert.notEqual(hashSecret(secret), secret);
    assert.equal(hashSecret(secret), hashSecret(secret));
});
