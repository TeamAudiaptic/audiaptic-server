import { z } from 'zod';
import { ackStatusSummaries, APIBaseEvent, MAX_EVENTS_PER_FRAME, MAX_FRAME_BYTES } from '../api-schemas/baseEvent.api.schema';
import { AudienceFrame, EventType } from '../api-schemas/baseEventMessage.api.schema';
import { INVALID_CODE_CLOSE } from '../sockets/routes/audience.route';

// AsyncAPI's schema format is a superset of JSON Schema draft-07.
// Drop the top-level $schema key; AsyncAPI doesn't want it on payloads.
const toSchema = (schema: z.ZodType) => {
    const { $schema, ...rest } = z.toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>;
    return rest;
};

// The status list, checked in this order; the first that applies is the ack's status.
const ackStatusDescription = ([400, 422, 500, 207, 202, 200] as const)
    .map((status) => `- \`${status}\`: ${ackStatusSummaries[status]}`)
    .join('\n');

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
    // Each can be sent alone or inside an eventList.
    const eventMessages = Object.fromEntries(
        EventType.options.map((event) => {
            const type = event.shape.type.value;
            return [`${type}Event`, { name: type, title: `${type} event`, payload: toSchema(event) }];
        }),
    );

    const eventListMessage = {
        name: 'event list',
        title: 'Event list',
        summary: `Performer → server: a list of 1-${MAX_EVENTS_PER_FRAME} events in one frame.`,
        description:
            'Each event is validated on its own, so valid events are relayed even when others are rejected. ' +
            'An eventId already used earlier in the same frame is rejected.',
        payload: toSchema(EventType.array().min(1).max(MAX_EVENTS_PER_FRAME)),
    };

    const ackMessage = {
        name: 'ack',
        title: 'Ack',
        summary: 'Server → performer: exactly one ack per frame, whether it held one event or a list.',
        description: `The status is the first of these that applies:\n\n${ackStatusDescription}`,
        payload: toSchema(APIBaseEvent.route.response),
    };

    // Ping stays between the performer and the server; the other events are relayed to the audience.
    const showEventNames = Object.keys(eventMessages).filter((name) => name !== 'pingEvent');

    // A lone event reaches the audience as the matching event message; a list as this.
    const audienceEventListMessage = {
        name: 'audience event list',
        title: 'Audience event list',
        summary: 'Server → audience: the valid show events from a performer list, in frame order.',
        description: 'Sent when the performer sent a list, even if only one of its events was valid.',
        payload: toSchema(AudienceFrame.options[1]),
    };

    const allMessages = {
        ...eventMessages,
        eventList: eventListMessage,
        ack: ackMessage,
        audienceEventList: audienceEventListMessage,
    };
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
                { name: 'audience', description: 'Audience devices receiving the show.' },
            ],
        },
        servers: {
            api: { host, pathname: '/api', protocol, description: 'The API app, behind the Caddy proxy.' },
        },
        channels: {
            performer: {
                address: '/performer',
                title: 'Performer',
                description:
                    `The performer sends one event or a list of up to ${MAX_EVENTS_PER_FRAME} events per frame; every frame is answered with exactly one ack, ` +
                    `in the order the frames arrived. A frame larger than ${MAX_FRAME_BYTES} bytes closes the socket with close code 1009 instead of being acked.`,
                messages: componentRefs([...Object.keys(eventMessages), 'eventList', 'ack']),
            },
            audience: {
                address: '/audience/{code}',
                title: 'Audience',
                description:
                    'Audience devices receive the valid show events from each performer frame in the form the performer sent them: a single event, or a list. Devices send nothing back yet. ' +
                    `If the join code is invalid, the server closes the socket with close code ${INVALID_CODE_CLOSE.code} and reason "${INVALID_CODE_CLOSE.reason}".`,
                parameters: {
                    code: {
                        // 'davhi' stands in for a performance join code until joining with a code is implemented.
                        description: 'The performance join code. Only `davhi` is valid for now.',
                    },
                },
                messages: componentRefs([...showEventNames, 'audienceEventList']),
            },
        },
        operations: {
            performerSendsEvent: {
                action: 'receive',
                title: 'Send events',
                summary: 'Performer → server: one event, or a list of events.',
                channel: { $ref: '#/channels/performer' },
                messages: channelRefs('performer', [...Object.keys(eventMessages), 'eventList']),
                tags: [{ name: 'performer' }],
            },
            performerReceivesAck: {
                action: 'send',
                title: 'Receive an ack',
                summary: 'Server → performer: exactly one ack per frame.',
                channel: { $ref: '#/channels/performer' },
                messages: channelRefs('performer', ['ack']),
                tags: [{ name: 'performer' }],
            },
            audienceReceivesEvent: {
                action: 'send',
                title: 'Receive events',
                summary: 'Server → audience: a show event, or a list of them, relayed from the performer.',
                channel: { $ref: '#/channels/audience' },
                messages: channelRefs('audience', [...showEventNames, 'audienceEventList']),
                tags: [{ name: 'audience' }],
            },
        },
        components: { messages: allMessages },
    };
}
