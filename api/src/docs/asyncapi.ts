import { z } from 'zod';
import { APIBaseEvent } from '../api-schemas/baseEvent.api.schema';
import { EventType } from '../api-schemas/baseEventMessage.api.schema';

// AsyncAPI's schema format is a superset of JSON Schema draft-07.
// Drop the top-level $schema key; AsyncAPI doesn't want it on payloads.
const toSchema = (schema: z.ZodType) => {
    const { $schema, ...rest } = z.toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>;
    return rest;
};

// Mirrors the comments on APIBaseEvent.route.response.
const ackSummaries: Record<keyof typeof APIBaseEvent.route.response, string> = {
    200: 'Understood.',
    202: 'Accepted and fanned out to devices.',
    400: 'The frame was not parseable as JSON.',
    422: 'Well-formed, but invalid for the schema or the session.',
    500: 'Accepted, but the server failed to distribute it.',
};

/**
 * Build the AsyncAPI document for the WebSocket routes.
 * Generated from the same Zod schemas that validate incoming frames,
 * so the docs can't drift from what the server actually accepts.
 *
 * `action` is from the server's point of view: 'receive' means a client
 * sends it to the server, 'send' means the server sends it to a client.
 */
export function buildAsyncApiSpec(host: string, protocol: 'ws' | 'wss') {
    // One message per event type: pingEvent, hapticEvent, ...
    const eventMessages = Object.fromEntries(
        EventType.options.map((event) => {
            const type = event.shape.type.value;
            return [`${type}Event`, { name: type, title: `${type} event`, payload: toSchema(event) }];
        }),
    );

    // One message per ack status: ack200, ack202, ...
    const ackMessages = Object.fromEntries(
        Object.entries(APIBaseEvent.route.response).map(([status, schema]) => [
            `ack${status}`,
            {
                name: `ack ${status}`,
                title: `Ack ${status}`,
                summary: ackSummaries[Number(status) as keyof typeof ackSummaries],
                payload: toSchema(schema),
            },
        ]),
    );

    const allMessages = { ...eventMessages, ...ackMessages };
    const componentRefs = (names: string[]) =>
        Object.fromEntries(names.map((name) => [name, { $ref: `#/components/messages/${name}` }]));
    const channelRefs = (channel: string, names: string[]) =>
        names.map((name) => ({ $ref: `#/channels/${channel}/messages/${name}` }));

    return {
        asyncapi: '3.0.0',
        info: {
            title: 'Audiaptic WebSocket API',
            version: '1.0.0',
            description:
                'Real-time connections to the server. All sockets live under `/api`, behind the Caddy proxy.',
            tags: [
                { name: 'performer', description: 'The performer driving the show. Will require authentication.' },
            ],
        },
        servers: {
            api: { host, pathname: '/api', protocol, description: 'The API app, behind the Caddy proxy.' },
        },
        channels: {
            performer: {
                address: '/performer',
                title: 'Performer',
                description: 'The performer sends show events; every event frame is answered with one ack.',
                messages: componentRefs(Object.keys(allMessages)),
            },
            // audience: { address: '/audience', ... } once that socket exists
        },
        operations: {
            performerSendsEvent: {
                action: 'receive',
                title: 'Send an event',
                summary: 'Performer → server: a show event.',
                channel: { $ref: '#/channels/performer' },
                messages: channelRefs('performer', Object.keys(eventMessages)),
                tags: [{ name: 'performer' }],
            },
            performerReceivesAck: {
                action: 'send',
                title: 'Receive an ack',
                summary: 'Server → performer: exactly one ack per event frame.',
                channel: { $ref: '#/channels/performer' },
                messages: channelRefs('performer', Object.keys(ackMessages)),
                tags: [{ name: 'performer' }],
            },
        },
        components: { messages: allMessages },
    };
}
