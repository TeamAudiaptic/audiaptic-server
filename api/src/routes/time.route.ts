import type { FastifyInstance } from 'fastify';
import fastifyRateLimit from '@fastify/rate-limit';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { APITime, type APITimeResponse200 } from '../api-schemas/time.api.schema';

/**
 * GET /api/time needs no login, so Max and the app can sync their clocks to
 * it. The rate limit only stops a runaway client or a flood; it must never
 * get in the way of real devices.
 *
 * It is per IP address, and at a venue every phone on the Wi-Fi can share one
 * public address. So the limit is sized for a whole audience of 2,000 phones
 * behind one IP. Each sync is a burst of 6 requests (SAMPLES_PER_BURST), sent
 * one after another, so a burst finishes in about a second.
 *
 * - Steady state: one burst per phone every 60 s (RESYNC_INTERVAL_MS) is
 *   2,000 x 6 / 6 = 2,000 requests per 10 s window.
 * - Worst case: every phone syncs at once, when the audience joins together
 *   or every socket reconnects after a server restart. That is
 *   2,000 x 6 = 12,000 requests, all inside one window, on top of the steady
 *   2,000: about 14,000.
 *
 * The limit sits just above that worst case. A client sending its bursts every
 * 5 s, as during testing, would put 2,000 phones over it, but a test with a
 * handful of devices is nowhere near.
 */
export const VENUE_PHONES_PER_IP = 2_000;
export const SAMPLES_PER_BURST = 6;
export const RESYNC_INTERVAL_MS = 60_000;

export const TIME_RATE_LIMIT = {
    max: 15_000,
    timeWindow: 10_000,
};

export interface TimeRouteOptions {
    /** Overrides TIME_RATE_LIMIT, for tests. */
    rateLimit?: { max: number; timeWindow: number };
}

export async function timeRoute(fastify: FastifyInstance, options: TimeRouteOptions) {
    // Registered inside this plugin, so the limit applies only to /time.
    // The client's IP comes from request.ip, which relies on the app's
    // trustProxy setting to see past Caddy (see trustProxy.ts).
    await fastify.register(fastifyRateLimit, options.rateLimit ?? TIME_RATE_LIMIT);

    const app = fastify.withTypeProvider<ZodTypeProvider>();

    app.route({
        method: 'GET',
        url: '/time',
        schema: APITime.route,
        handler: async (request, reply) => {
            const response: APITimeResponse200 = {
                serverTimestamp: request.serverTimestamp,
            };
            return reply.header('Cache-Control', 'no-store').status(200).send(response);
        },
    });
}
