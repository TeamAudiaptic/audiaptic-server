import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { APIHelloWorld, APIHelloWorldResponse200 } from '../api-schemas/helloWorld.api.schema';

export async function helloWorldRoute(fastify: FastifyInstance) {
    const app = fastify.withTypeProvider<ZodTypeProvider>();

    app.route({
        method: 'GET',
        url: '/',
        schema: APIHelloWorld.route,
        handler: async (request, reply) => {
            const response: APIHelloWorldResponse200 = {
                message: 'Hello, world!',
            };
            return reply.status(200).send(response);
        },
    });
}
