import { emitKeypressEvents } from 'node:readline';
import { pathToFileURL } from 'node:url';

import { migrate, openDatabase } from './db.mjs';
import { hashPassword } from './security.mjs';

export const resetAdminPassword = async (db, username, password) => {
    if (typeof password !== 'string' || password.length < 12) {
        throw new Error('Password must be at least 12 characters.');
    }
    const admin = db
        .prepare("SELECT id FROM users WHERE username = ? AND role = 'ADMIN'")
        .get(username);
    if (!admin) throw new Error(`Administrator not found: ${username}`);

    const encoded = await hashPassword(password);
    const now = new Date().toISOString();
    db.exec('BEGIN IMMEDIATE');
    try {
        db.prepare(
            `UPDATE users
             SET password_hash = ?, must_change_password = 1, updated_at = ?
             WHERE id = ?`
        ).run(encoded, now, admin.id);
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(admin.id);
        db.exec('COMMIT');
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
};

const readHidden = (prompt) =>
    new Promise((resolve, reject) => {
        if (!process.stdin.isTTY || !process.stdout.isTTY) {
            reject(
                new Error('Password reset requires an interactive terminal.')
            );
            return;
        }
        let value = '';
        const input = process.stdin;
        const finish = (error) => {
            input.off('keypress', onKeypress);
            input.setRawMode(false);
            input.pause();
            process.stdout.write('\n');
            if (error) reject(error);
            else resolve(value);
        };
        const onKeypress = (text, key) => {
            if (key?.ctrl && key.name === 'c') {
                finish(new Error('Password reset cancelled.'));
            } else if (key?.name === 'return' || key?.name === 'enter') {
                finish();
            } else if (key?.name === 'backspace') {
                value = value.slice(0, -1);
            } else if (text && !key?.ctrl && !key?.meta) {
                value += text;
            }
        };
        emitKeypressEvents(input);
        input.setRawMode(true);
        input.resume();
        input.on('keypress', onKeypress);
        process.stdout.write(prompt);
    });

const main = async () => {
    const username = process.argv[2]?.trim();
    if (!username) {
        throw new Error('Usage: npm run admin:reset-password -- <username>');
    }
    const first = await readHidden('New password: ');
    const second = await readHidden('Repeat password: ');
    if (first !== second) throw new Error('Passwords do not match.');

    const db = openDatabase(
        process.env.DATABASE_FILE ?? '/data/chartdb.sqlite'
    );
    migrate(db);
    await resetAdminPassword(db, username, first);
    console.log(`Password reset for ${username}.`);
};

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    main().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
