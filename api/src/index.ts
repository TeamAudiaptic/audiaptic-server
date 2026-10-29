import Fastify, { type FastifyRequest } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { validatorCompiler, serializerCompiler, jsonSchemaTransform } from 'fastify-type-provider-zod';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import { env } from './env.js';
import { R2Upload, R2List, type R2UploadResponse201, type R2ListResponse200 } from './api-schemas/r2.api.schema.js';
import { performerRoute } from './sockets/routes/performer.route';
import { audienceRoute } from './sockets/routes/audience.route';
import { helloWorldRoute } from './routes/helloWorld.route';
import { buildAsyncApiSpec } from './docs/asyncapi';

const isProd = env.NODE_ENV === 'production';

const app = Fastify({
    logger: true,
}).withTypeProvider<ZodTypeProvider>();

// Add CORS before other plugins
app.register(fastifyCors, {
  origin: true, // Allow all origins (for demo; restrict in production)
});

// Content-type parsers with proper types
app.addContentTypeParser('application/octet-stream', async (_request: FastifyRequest, payload: NodeJS.ReadableStream) => {
  const chunks: (string | Buffer)[] = [];
  for await (const chunk of payload) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks.map(c => typeof c === 'string' ? Buffer.from(c) : c));
});

app.addContentTypeParser(/^.*/, async (_request: FastifyRequest, payload: NodeJS.ReadableStream) => {
  const chunks: (string | Buffer)[] = [];
  for await (const chunk of payload) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks.map(c => typeof c === 'string' ? Buffer.from(c) : c));
});


// Set up Zod validation compilers for Fastify
app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

// Initialize S3Client for Cloudflare R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME;

app.register(fastifyWebsocket)
// 1. Register the core Swagger plugin
app.register(fastifySwagger, {
    openapi: {
        info: {
            title: 'Distributed Audio-Visual-Haptic Interface Server API',
            description:
                'REST routes for the server. Performer events are sent over WebSocket at `/api/performer` ' +
                'and are documented separately on the **WebSocket API** page.',
            version: '1.0.0',
        },
        // Requests come in through Caddy, which forwards /api/* to this app
        servers: [
            {
                url: `${isProd ? 'https' : 'http'}://${env.SITE_DOMAIN}`,
            },
        ],
    },
    transform: jsonSchemaTransform, // Crucial: Intercepts and transforms Zod schemas to OpenAPI formats
});

// 2. Register the Swagger UI interface (accessible locally at http://localhost/api/docs)
app.register(fastifySwaggerUi, {
    routePrefix: '/api/docs',
});

// Upload to R2
app.route({
    method: 'POST',
    url: '/api/r2/upload',
    schema: {
      description: 'Upload a file to Cloudflare R2',
      tags: ['R2'],
      response: R2Upload.route.response,
      // Deliberately omit request body validation
    },
    handler: async (request, reply) => {
        try {
            const fileName = request.headers['x-filename'] as string;
            const fileData = request.body as Buffer;

            if (!fileName) {
                return reply.status(400).send({ error: 'Missing x-filename header' });
            }

            const command = new PutObjectCommand({
                Bucket: BUCKET_NAME,
                Key: fileName,
                Body: fileData,
                ContentType: request.headers['content-type'] || 'application/octet-stream',
            });

            const response = await s3Client.send(command);
            const result: R2UploadResponse201 = {
                success: true,
                message: `File ${fileName} uploaded successfully`,
                etag: response.ETag!,
            };

            return reply.status(201).send(result);
        } catch (error) {
            app.log.error(error);
            return reply.status(500).send({ error: 'Upload failed' });
        }
    },
});

// List files in R2
app.route({
    method: 'GET',
    url: '/api/r2/files',
    schema: R2List.route,
    handler: async (request, reply) => {
        try {
            const command = new ListObjectsV2Command({ Bucket: BUCKET_NAME });
            const response = await s3Client.send(command);
            const files = (response.Contents || []).map((obj) => ({
                name: obj.Key!,
                size: obj.Size || 0,
                lastModified: obj.LastModified,
            }));

            const result: R2ListResponse200 = { files };
            return reply.status(200).send(result);
        } catch (error) {
            app.log.error(error);
            return reply.status(500).send({ error: 'Failed to list files' });
        }
    },
});

// Caddy forwards /api/* to this app without stripping the prefix,
// so every route has to live under /api too
app.register(performerRoute, { prefix: '/api' });
app.register(audienceRoute, { prefix: '/api' });
app.register(helloWorldRoute, { prefix: '/api' });
// Fastify must bind to 0.0.0.0 inside Docker containers
const start = async () => {
    try {
        // 3. Ensure plugins finish mounting, then write openapi.json file for Docusaurus
        await app.ready();
        const openapiSpec = JSON.stringify(app.swagger(), null, 2);
        fs.writeFileSync(path.join(process.cwd(), 'openapi.json'), openapiSpec);

        // OpenAPI can't describe WebSocket routes, so the sockets get an AsyncAPI spec
        const asyncapiSpec = buildAsyncApiSpec(env.SITE_DOMAIN, isProd ? 'wss' : 'ws');
        fs.writeFileSync(path.join(process.cwd(), 'asyncapi.json'), JSON.stringify(asyncapiSpec, null, 2));

        if (process.argv.includes('--export-schema')) {
            app.log.info('Schema exported successfully. Exiting.');
            process.exit(0); // Exit cleanly without starting app.listen()
        }

        await app.listen({ port: env.PORT, host: '0.0.0.0' });

    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }

};

start();
