import assert from 'node:assert/strict';
import { test } from 'node:test';

import { appendAudit } from '../src/audit.mjs';
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

test('migration adds an optional department without losing existing users', () => {
    const db = openDatabase(':memory:');
    db.exec(`
        CREATE TABLE schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL
        );
        CREATE TABLE users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL COLLATE NOCASE UNIQUE,
            display_name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL,
            must_change_password INTEGER NOT NULL,
            active INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        INSERT INTO users VALUES (
            'existing-id', 'existing', 'Existing User', 'hash', 'VIEWER',
            0, 1, '2026-08-06T00:00:00.000Z', '2026-08-06T00:00:00.000Z'
        );
        INSERT INTO schema_migrations VALUES
            (1, '2026-08-04T00:00:00.000Z'),
            (2, '2026-08-05T00:00:00.000Z');
    `);

    migrate(db);

    const columns = db.prepare('PRAGMA table_info(users)').all();
    assert.equal(
        columns.some((column) => column.name === 'department'),
        true
    );
    assert.deepEqual(
        { ...db.prepare('SELECT username, department FROM users').get() },
        { username: 'existing', department: null }
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

test('migration creates append-only audit storage', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    await bootstrapAdmin(db, {
        CHARTDB_BOOTSTRAP_ADMIN_USERNAME: 'admin',
        CHARTDB_BOOTSTRAP_ADMIN_PASSWORD: 'temporary-password-123',
    });
    const actorUserId = db.prepare('SELECT id FROM users').get().id;

    appendAudit(db, {
        actorUserId,
        action: 'GROUP_MEMBERS_REPLACED',
        targetType: 'GROUP',
        targetId: 'group-id',
        detail: { before: ['a'], after: ['b'] },
        at: '2026-08-06T00:00:00.000Z',
    });

    const row = db.prepare('SELECT * FROM audit_log').get();
    assert.equal(row.at, '2026-08-06T00:00:00.000Z');
    assert.equal(row.actor_user_id, actorUserId);
    assert.equal(row.action, 'GROUP_MEMBERS_REPLACED');
    assert.equal(row.target_type, 'GROUP');
    assert.equal(row.target_id, 'group-id');
    assert.deepEqual(JSON.parse(row.detail_json), {
        before: ['a'],
        after: ['b'],
    });
});
