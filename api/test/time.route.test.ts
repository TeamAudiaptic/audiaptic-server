import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    RESYNC_INTERVAL_MS,
    SAMPLES_PER_BURST,
    TIME_RATE_LIMIT,
    VENUE_PHONES_PER_IP,
    timeRoute,
} from '../src/routes/time.route';
import { trustCaddyOnly } from '../src/trustProxy';

const LIMIT = 3;

/** Set up like index.ts, with a small limit so a test can reach it. */
async function buildApp(max = LIMIT) {
    const app = Fastify({ trustProxy: trustCaddyOnly });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    app.decorateRequest('serverTimestamp', 0);
    app.addHook('onRequest', async (request) => {
        request.serverTimestamp = Date.now();
    });
    await app.register(timeRoute, { prefix: '/api', rateLimit: { max, timeWindow: 60_000 } });
    await app.register(async (other) => {
        other.get('/api/other', async () => ({ ok: true }));
    });
    await app.ready();
    return app;
}

/** A request as Caddy forwards it: from Caddy, with the client in X-Forwarded-For. */
function getTime(app: FastifyInstance, forwardedFor = '203.0.113.1', url = '/api/time') {
    return app.inject({
        method: 'GET',
        url,
        remoteAddress: '172.18.0.2',
        headers: { 'x-forwarded-for': forwardedFor },
    });
}

describe('GET /api/time rate limit', () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        app = await buildApp();
    });

    afterEach(async () => {
        await app.close();
    });

    it('serves the time, uncached, up to the limit', async () => {
        for (let i = 0; i < LIMIT; i += 1) {
            const response = await getTime(app);
            expect(response.statusCode).toBe(200);
            expect(response.headers['cache-control']).toBe('no-store');
            expect(response.json().serverTimestamp).toBeGreaterThan(0);
        }
    });

    it('answers 429 once a client passes the limit', async () => {
        for (let i = 0; i < LIMIT; i += 1) {
            await getTime(app);
        }
        const response = await getTime(app);
        expect(response.statusCode).toBe(429);
        expect(response.headers['retry-after']).toBeDefined();
    });

    it('counts each client separately, not everyone behind Caddy together', async () => {
        for (let i = 0; i < LIMIT; i += 1) {
            await getTime(app, '203.0.113.1');
        }
        expect((await getTime(app, '203.0.113.1')).statusCode).toBe(429);
        expect((await getTime(app, '203.0.113.2')).statusCode).toBe(200);
    });

    it("ignores an X-Forwarded-For the client sent itself", async () => {
        // Caddy appends the real client; a forged entry before it is not trusted
        for (let i = 0; i < LIMIT; i += 1) {
            await getTime(app, `198.51.100.${i}, 203.0.113.1`);
        }
        expect((await getTime(app, '198.51.100.99, 203.0.113.1')).statusCode).toBe(429);
    });

    it('does not limit other routes', async () => {
        for (let i = 0; i < LIMIT + 2; i += 1) {
            expect((await getTime(app, '203.0.113.1', '/api/other')).statusCode).toBe(200);
        }
    });
});

describe('TIME_RATE_LIMIT', () => {
    it('allows a whole venue behind one IP to sync at once, on top of the steady 60 s re-syncs', () => {
        const steady = VENUE_PHONES_PER_IP * SAMPLES_PER_BURST * (TIME_RATE_LIMIT.timeWindow / RESYNC_INTERVAL_MS);
        const everyoneAtOnce = VENUE_PHONES_PER_IP * SAMPLES_PER_BURST;
        expect(TIME_RATE_LIMIT.max).toBeGreaterThanOrEqual(steady + everyoneAtOnce);
    });
});
