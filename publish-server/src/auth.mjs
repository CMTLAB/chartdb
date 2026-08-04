import { publicUser, trimString } from './http.mjs';
import {
    hashPassword,
    hashSecret,
    newSecret,
    verifyPassword,
} from './security.mjs';

export const SESSION_COOKIE = 'chartdb_session';
const SESSION_SECONDS = 8 * 60 * 60;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;

const sessionCookieOptions = (secure) => ({
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: SESSION_SECONDS,
});

const findSessionUser = (db, token, now) => {
    if (!token) return null;
    const tokenHash = hashSecret(token);
    const row = db
        .prepare(
            `SELECT u.*, s.token_hash AS session_hash
             FROM sessions s
             JOIN users u ON u.id = s.user_id
             WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`
        )
        .get(tokenHash, new Date(now()).toISOString());
    if (!row) {
        db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
        return null;
    }
    return row;
};

export const authenticate =
    (db, now = Date.now) =>
    async (request, reply) => {
        const row = findSessionUser(db, request.cookies[SESSION_COOKIE], now);
        if (!row) {
            return reply.code(401).send({ error: 'Authentication required.' });
        }
        request.user = publicUser(row);
        request.sessionHash = row.session_hash;
    };

export const requireReadyUser = async (request, reply) => {
    if (request.user?.mustChangePassword) {
        return reply.code(403).send({
            error: 'Password change required.',
            code: 'PASSWORD_CHANGE_REQUIRED',
        });
    }
};

export const registerAuthRoutes = async (
    app,
    { db, secureCookies = process.env.COOKIE_SECURE === 'true', now = Date.now }
) => {
    const failedLogins = new Map();
    const requireSession = authenticate(db, now);
    const dummyPasswordHash = await hashPassword(newSecret());

    app.post('/api/auth/login', async (request, reply) => {
        const currentTime = now();
        const recentFailures = (failedLogins.get(request.ip) ?? []).filter(
            (time) => currentTime - time < LOGIN_WINDOW_MS
        );
        if (recentFailures.length >= LOGIN_MAX_FAILURES) {
            return reply.code(429).send({ error: 'Too many login attempts.' });
        }

        const username = trimString(request.body?.username);
        const password = request.body?.password;
        const validCredentials =
            typeof username === 'string' && typeof password === 'string';
        const row = validCredentials
            ? db
                  .prepare(
                      'SELECT * FROM users WHERE username = ? AND active = 1'
                  )
                  .get(username)
            : null;
        const passwordMatches = validCredentials
            ? await verifyPassword(
                  password,
                  row?.password_hash ?? dummyPasswordHash
              )
            : false;
        if (!row || !passwordMatches) {
            recentFailures.push(currentTime);
            failedLogins.set(request.ip, recentFailures);
            return reply
                .code(401)
                .send({ error: 'Invalid username or password.' });
        }

        failedLogins.delete(request.ip);
        const secret = newSecret();
        const createdAt = new Date(currentTime).toISOString();
        const expiresAt = new Date(
            currentTime + SESSION_SECONDS * 1000
        ).toISOString();
        db.prepare(
            'INSERT INTO sessions(token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
        ).run(hashSecret(secret), row.id, expiresAt, createdAt);
        reply.setCookie(
            SESSION_COOKIE,
            secret,
            sessionCookieOptions(secureCookies)
        );
        return { user: publicUser(row) };
    });

    app.get(
        '/api/auth/me',
        { preHandler: requireSession },
        async (request) => ({ user: request.user })
    );

    app.post(
        '/api/auth/logout',
        { preHandler: requireSession },
        async (request, reply) => {
            db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(
                request.sessionHash
            );
            reply.clearCookie(
                SESSION_COOKIE,
                sessionCookieOptions(secureCookies)
            );
            return reply.code(204).send();
        }
    );

    app.post(
        '/api/auth/change-password',
        { preHandler: requireSession },
        async (request, reply) => {
            const currentPassword = request.body?.currentPassword;
            const newPassword = request.body?.newPassword;
            if (
                typeof currentPassword !== 'string' ||
                typeof newPassword !== 'string' ||
                newPassword.length < 12
            ) {
                return reply.code(422).send({
                    error: 'Current password and a new password of at least 12 characters are required.',
                });
            }
            const row = db
                .prepare('SELECT password_hash FROM users WHERE id = ?')
                .get(request.user.id);
            if (
                !row ||
                !(await verifyPassword(currentPassword, row.password_hash))
            ) {
                return reply
                    .code(401)
                    .send({ error: 'Current password is incorrect.' });
            }

            const encoded = await hashPassword(newPassword);
            const timestamp = new Date(now()).toISOString();
            db.exec('BEGIN IMMEDIATE');
            try {
                db.prepare(
                    `UPDATE users
                     SET password_hash = ?, must_change_password = 0, updated_at = ?
                     WHERE id = ?`
                ).run(encoded, timestamp, request.user.id);
                db.prepare('DELETE FROM sessions WHERE user_id = ?').run(
                    request.user.id
                );
                db.exec('COMMIT');
            } catch (error) {
                db.exec('ROLLBACK');
                throw error;
            }
            reply.clearCookie(
                SESSION_COOKIE,
                sessionCookieOptions(secureCookies)
            );
            return reply.code(204).send();
        }
    );

    app.decorate('requireSession', requireSession);
};
