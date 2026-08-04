import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { hashPassword } from './security.mjs';

const MIGRATIONS = [
    `
    CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL COLLATE NOCASE UNIQUE,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('ADMIN', 'PUBLISHER', 'VIEWER')),
        must_change_password INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0, 1)),
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        created_at TEXT NOT NULL
    );

    CREATE TABLE user_groups (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, group_id)
    );

    CREATE TABLE diagrams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_by_user_id TEXT NOT NULL REFERENCES users(id),
        current_version_id TEXT,
        archived_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE diagram_publishers (
        diagram_id TEXT NOT NULL REFERENCES diagrams(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        PRIMARY KEY (diagram_id, user_id)
    );

    CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
    );

    CREATE TABLE api_tokens (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        expires_at TEXT,
        revoked_at TEXT,
        last_used_at TEXT,
        created_at TEXT NOT NULL
    );

    CREATE TABLE diagram_versions (
        id TEXT PRIMARY KEY,
        diagram_id TEXT NOT NULL REFERENCES diagrams(id) ON DELETE CASCADE,
        version_no INTEGER NOT NULL CHECK (version_no > 0),
        content_json TEXT NOT NULL,
        changed_by_user_id TEXT NOT NULL REFERENCES users(id),
        api_token_id TEXT REFERENCES api_tokens(id),
        source TEXT NOT NULL CHECK (source IN ('WEB', 'API_TOKEN', 'RESTORE')),
        change_note TEXT,
        created_at TEXT NOT NULL,
        UNIQUE (diagram_id, version_no)
    );

    CREATE TABLE group_diagram_grants (
        group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        diagram_id TEXT NOT NULL REFERENCES diagrams(id) ON DELETE CASCADE,
        PRIMARY KEY (group_id, diagram_id)
    );

    CREATE TABLE user_diagram_grants (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        diagram_id TEXT NOT NULL REFERENCES diagrams(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, diagram_id)
    );

    CREATE INDEX sessions_user_id_idx ON sessions(user_id);
    CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);
    CREATE INDEX diagram_versions_diagram_id_idx ON diagram_versions(diagram_id, version_no DESC);
    CREATE INDEX api_tokens_owner_idx ON api_tokens(owner_user_id);
    `,
];

export const openDatabase = (filename) => {
    if (filename !== ':memory:') {
        mkdirSync(dirname(filename), { recursive: true });
    }
    const db = new DatabaseSync(filename);
    db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    if (filename !== ':memory:') {
        db.exec('PRAGMA journal_mode = WAL;');
    }
    return db;
};

export const migrate = (db) => {
    db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL
        );
    `);
    const applied = db.prepare(
        'SELECT 1 FROM schema_migrations WHERE version = ?'
    );
    const record = db.prepare(
        'INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)'
    );

    for (const [index, sql] of MIGRATIONS.entries()) {
        const version = index + 1;
        if (applied.get(version)) continue;
        db.exec('BEGIN IMMEDIATE');
        try {
            db.exec(sql);
            record.run(version, new Date().toISOString());
            db.exec('COMMIT');
        } catch (error) {
            db.exec('ROLLBACK');
            throw error;
        }
    }
};

const validateBootstrap = (username, password) => {
    if (!/^[A-Za-z0-9._-]{3,64}$/.test(username) || password.length < 12) {
        throw new Error(
            'Bootstrap administrator credentials require a 3-64 character username and a password of at least 12 characters.'
        );
    }
};

export const bootstrapAdmin = async (db, env = process.env) => {
    if (db.prepare('SELECT 1 FROM users LIMIT 1').get()) return false;

    const username = env.CHARTDB_BOOTSTRAP_ADMIN_USERNAME?.trim() ?? '';
    const password = env.CHARTDB_BOOTSTRAP_ADMIN_PASSWORD ?? '';
    validateBootstrap(username, password);
    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();

    db.exec('BEGIN IMMEDIATE');
    try {
        if (db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
            db.exec('COMMIT');
            return false;
        }
        db.prepare(
            `INSERT INTO users(
                id, username, display_name, password_hash, role,
                must_change_password, active, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'ADMIN', 1, 1, ?, ?)`
        ).run(randomUUID(), username, username, passwordHash, now, now);
        db.exec('COMMIT');
        return true;
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
};
