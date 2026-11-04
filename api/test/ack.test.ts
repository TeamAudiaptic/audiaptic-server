import { describe, expect, it, vi } from 'vitest';
import { eventsAck } from '../src/api-schemas/baseEvent.api.schema';

vi.mock('../src/sockets/audience.hub', () => ({
    broadcastToAudience: () => { throw new Error('broadcast failed'); },
}));

const rejection = { index: 1, eventId: 'evt-2', errors: ['bad'] };

describe('eventsAck status order', () => {
    it.each([
        ['nothing valid beats a failed broadcast', { accepted: [], rejected: [rejection], relayed: 0, deliveredTo: 0, broadcastError: 'x' }, 422],
        ['a failed broadcast beats partial success', { accepted: ['evt-1'], rejected: [rejection], relayed: 1, deliveredTo: 0, broadcastError: 'x' }, 500],
        ['partial success beats relayed', { accepted: ['evt-1'], rejected: [rejection], relayed: 1, deliveredTo: 3 }, 207],
        ['relayed', { accepted: ['evt-1'], rejected: [], relayed: 1, deliveredTo: 3 }, 202],
        ['relayed to no connected devices', { accepted: ['evt-1'], rejected: [], relayed: 1, deliveredTo: 0 }, 202],
        ['nothing to relay', { accepted: ['evt-1'], rejected: [], relayed: 0, deliveredTo: 0 }, 200],
    ])('%s', (_name, input, status) => {
        expect(eventsAck(input).status).toBe(status);
    });

    it('puts a broadcast error in the frame-level errors', () => {
        const ack = eventsAck({ accepted: ['evt-1'], rejected: [], relayed: 1, deliveredTo: 0, broadcastError: 'failed' });
        expect(ack.errors).toEqual(['failed']);
        expect(ack.accepted).toEqual(['evt-1']);
    });
});

describe('a failed broadcast', () => {
    it('acks 500 and keeps the valid events in accepted', async () => {
        const { default: performerEventHandler } = await import('../src/sockets/handlers/performer/main.performer.handler');
        const event = {
            schemaVersion: '1.0' as const,
            eventId: 'evt-1',
            sequence: 1,
            sentTimestamp: 1,
            execTimestamp: 2,
            type: 'caption' as const,
            payload: { text: 'hello' },
        };
        const ack = performerEventHandler([event], []);
        expect(ack).toMatchObject({ status: 500, accepted: ['evt-1'], rejected: [], deliveredTo: 0 });
        expect(ack.errors).toHaveLength(1);
    });
});
