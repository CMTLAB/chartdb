import cookie from '@fastify/cookie';
import Fastify from 'fastify';

import { registerAuthRoutes, SESSION_COOKIE } from './auth.mjs';
import { registerAdminRoutes } from './admin.mjs';
import { registerDiagramRoutes } from './diagrams.mjs';
import { isSameOrigin } from './http.mjs';
import { actorAuthentication, registerTokenRoutes } from './tokens.mjs';

export const buildApp = async ({
    db,
    secureCookies = process.env.COOKIE_SECURE === 'true',
    now = Date.now,
    logger = false,
} = {}) => {
    if (!db) throw new Error('buildApp requires a database.');
    const app = Fastify({
        bodyLimit: 256 * 1024,
        trustProxy: true,
        logger,
    });
    await app.register(cookie);
    app.decorateRequest('user', null);
    app.decorateRequest('sessionHash', '');
    app.decorateRequest('apiTokenId', '');
    app.decorateRequest('authSource', '');

    app.addHook('onRequest', async (request, reply) => {
        if (
            !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
            request.cookies[SESSION_COOKIE] &&
            !isSameOrigin(request)
        ) {
            return reply
                .code(403)
                .send({ error: 'Cross-site request rejected.' });
        }
    });

    app.get('/api/health', async () => ({ ok: true }));
    await registerAuthRoutes(app, { db, secureCookies, now });
    await registerAdminRoutes(app, { db });
    await registerTokenRoutes(app, { db });
    await registerDiagramRoutes(app, {
        db,
        authenticateActor: actorAuthentication(db, app.requireSession, now),
    });

    app.setErrorHandler((error, request, reply) => {
        request.log.error(error);
        if (reply.sent) return;
        reply.code(error.statusCode ?? 500).send({
            error:
                error.statusCode && error.statusCode < 500
                    ? error.message
                    : 'Internal server error.',
        });
    });
    await app.ready();
    return app;
};
