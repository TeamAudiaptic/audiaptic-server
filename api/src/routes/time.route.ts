import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { APITime, type APITimeResponse200 } from '../api-schemas/time.api.schema';

export async function timeRoute(fastify: FastifyInstance) {
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
