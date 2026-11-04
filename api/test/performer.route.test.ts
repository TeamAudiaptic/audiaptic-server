import Fastify, { FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_EVENTS_PER_FRAME, MAX_FRAME_BYTES } from '../src/api-schemas/baseEvent.api.schema';
import { addAudienceSocket } from '../src/sockets/audience.hub';
import { audienceRoute } from '../src/sockets/routes/audience.route';
import { performerRoute } from '../src/sockets/routes/performer.route';

// The envelope the server currently requires.
const envelope = (eventId: string, sequence = 1) => ({
    schemaVersion: '1.0',
    eventId,
    sequence,
    sentTimestamp: 1_730_000_000_000,
    execTimestamp: 1_790_000_000_000,
});
const haptic = (eventId: string) => ({ ...envelope(eventId), type: 'haptic', payload: { intensity: 0.5, durationMs: 100, transitionMs: 0 } });
const caption = (eventId: string) => ({ ...envelope(eventId), type: 'caption', payload: { text: 'hello' } });
const ping = (eventId: string) => ({ ...envelope(eventId), type: 'ping', payload: {} });
const invalidHaptic = (eventId: string) => ({ ...envelope(eventId), type: 'haptic', payload: { intensity: 2 } });

/** Queue a socket's messages so a test can await them in order. */
function inbox(socket: WebSocket) {
    const queued: unknown[] = [];
    const waiting: ((message: unknown) => void)[] = [];
    socket.on('message', (data) => {
        const message = JSON.parse(data.toString());
        const resolve = waiting.shift();
        if (resolve) {
            resolve(message);
        } else {
            queued.push(message);
        }
    });
    return {
        next: (): Promise<any> => (queued.length > 0 ? Promise.resolve(queued.shift()) : new Promise((resolve) => waiting.push(resolve))),
        queued,
    };
}

/** Give a frame that should never reach the audience time to arrive anyway. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

let app: FastifyInstance;
let performer: WebSocket;
let audience: WebSocket;
let acks: ReturnType<typeof inbox>;
let received: ReturnType<typeof inbox>;

beforeEach(async () => {
    app = Fastify();
    await app.register(fastifyWebsocket, { options: { maxPayload: MAX_FRAME_BYTES } });
    await app.register(performerRoute, { prefix: '/api' });
    await app.register(audienceRoute, { prefix: '/api' });
    await app.ready();
    audience = await app.injectWS('/api/audience/davhi');
    received = inbox(audience);
    performer = await app.injectWS('/api/performer');
    acks = inbox(performer);
});

afterEach(async () => {
    performer.terminate();
    audience.terminate();
    await app.close();
});

const send = (frame: unknown) => performer.send(typeof frame === 'string' ? frame : JSON.stringify(frame));

describe('performer frames', () => {
    it('relays a single event as a one-item list', async () => {
        send(haptic('evt-1'));
        expect(await acks.next()).toEqual({ type: 'ack', status: 202, accepted: ['evt-1'], rejected: [], deliveredTo: 1, errors: [] });
        expect(await received.next()).toEqual([haptic('evt-1')]);
    });

    it('relays a valid list as one list, in frame order', async () => {
        send([caption('evt-1'), haptic('evt-2'), caption('evt-3')]);
        const ack = await acks.next();
        expect(ack.status).toBe(202);
        expect(ack.accepted).toEqual(['evt-1', 'evt-2', 'evt-3']);
        expect(await received.next()).toEqual([caption('evt-1'), haptic('evt-2'), caption('evt-3')]);
        await settle();
        expect(received.queued).toEqual([]);
    });

    it('relays the valid events and reports the rest on partial success', async () => {
        send([haptic('evt-1'), invalidHaptic('evt-2'), { type: 'haptic' }, caption('evt-4')]);
        const ack = await acks.next();
        expect(ack.status).toBe(207);
        expect(ack.accepted).toEqual(['evt-1', 'evt-4']);
        expect(ack.rejected.map((r: any) => [r.index, r.eventId])).toEqual([[1, 'evt-2'], [2, null]]);
        expect(ack.rejected[0].errors.length).toBeGreaterThan(0);
        expect(ack.deliveredTo).toBe(1);
        expect(await received.next()).toEqual([haptic('evt-1'), caption('evt-4')]);
    });

    it('rejects a later event that repeats an eventId in the same frame', async () => {
        send([haptic('evt-1'), caption('evt-1')]);
        const ack = await acks.next();
        expect(ack.status).toBe(207);
        expect(ack.accepted).toEqual(['evt-1']);
        expect(ack.rejected).toEqual([{ index: 1, eventId: 'evt-1', errors: [expect.stringContaining('Duplicate eventId')] }]);
        expect(await received.next()).toEqual([haptic('evt-1')]);
    });

    it('allows the same eventId in different frames', async () => {
        send(haptic('evt-1'));
        expect((await acks.next()).status).toBe(202);
        send(haptic('evt-1'));
        expect((await acks.next()).status).toBe(202);
    });

    it('relays nothing when every event is invalid', async () => {
        send([invalidHaptic('evt-1'), invalidHaptic('evt-2')]);
        const ack = await acks.next();
        expect(ack.status).toBe(422);
        expect(ack.accepted).toEqual([]);
        expect(ack.rejected.map((r: any) => r.index)).toEqual([0, 1]);
        expect(ack.deliveredTo).toBe(0);
        await settle();
        expect(received.queued).toEqual([]);
    });

    it('acks pings with 200 and relays nothing', async () => {
        send([ping('evt-1'), ping('evt-2')]);
        expect(await acks.next()).toEqual({ type: 'ack', status: 200, accepted: ['evt-1', 'evt-2'], rejected: [], deliveredTo: 0, errors: [] });
        await settle();
        expect(received.queued).toEqual([]);
    });

    it('reports 207 for pings mixed with invalid events, and relays nothing', async () => {
        send([ping('evt-1'), invalidHaptic('evt-2')]);
        const ack = await acks.next();
        expect(ack.status).toBe(207);
        expect(ack.deliveredTo).toBe(0);
        await settle();
        expect(received.queued).toEqual([]);
    });

    it('leaves pings out of the relayed list', async () => {
        send([ping('evt-1'), haptic('evt-2')]);
        expect((await acks.next()).status).toBe(202);
        expect(await received.next()).toEqual([haptic('evt-2')]);
    });

    it.each([
        ['an empty list', []],
        ['a list over the limit', Array.from({ length: MAX_EVENTS_PER_FRAME + 1 }, (_, i) => ping(`evt-${i}`))],
        ['a value that is not an event or a list', 42],
        ['null', null],
    ])('rejects %s as a whole frame with 422', async (_name, frame) => {
        send(frame);
        const ack = await acks.next();
        expect(ack).toMatchObject({ status: 422, accepted: [], rejected: [], deliveredTo: 0 });
        expect(ack.errors.length).toBe(1);
    });

    it('accepts a list at the limit', async () => {
        send(Array.from({ length: MAX_EVENTS_PER_FRAME }, (_, i) => ping(`evt-${i}`)));
        expect((await acks.next()).status).toBe(200);
    });

    it('rejects a frame that is not JSON with 400', async () => {
        send('{not json');
        expect(await acks.next()).toEqual({ type: 'ack', status: 400, accepted: [], rejected: [], deliveredTo: 0, errors: ['The frame is not valid JSON.'] });
    });

    it('sends acks in the order the frames arrived', async () => {
        send(haptic('evt-1'));
        send('{not json');
        send([ping('evt-2')]);
        send([invalidHaptic('evt-3')]);
        const statuses = [];
        for (let i = 0; i < 4; i++) {
            statuses.push((await acks.next()).status);
        }
        expect(statuses).toEqual([202, 400, 200, 422]);
    });

    it('accepts the largest valid frame without reaching the size limit', async () => {
        // 500 captions with the longest eventId and text, written as escaped surrogate pairs,
        // the most bytes a character can take in JSON.
        const emoji = '\\ud83d\\ude00';
        const raw = '[' + Array.from({ length: MAX_EVENTS_PER_FRAME }, (_, i) => {
            const eventId = String(i).padStart(200, '0');
            return JSON.stringify({ ...caption(eventId), payload: { text: '' } }).replace('"text":""', `"text":"${emoji.repeat(250)}"`);
        }).join(',') + ']';
        expect(Buffer.byteLength(raw)).toBeLessThan(MAX_FRAME_BYTES);
        send(raw);
        expect((await acks.next()).status).toBe(202);
    });

    it('closes the socket with 1009 when a frame is over the size limit', async () => {
        const closed = new Promise<number>((resolve) => performer.on('close', (code) => resolve(code)));
        send('x'.repeat(MAX_FRAME_BYTES + 1));
        expect(await closed).toBe(1009);
    });

    it('still delivers to other devices when one device fails', async () => {
        let closeBroken = () => {};
        const broken = {
            OPEN: 1,
            readyState: 1,
            send: () => { throw new Error('broken device'); },
            on: (_event: string, listener: () => void) => { closeBroken = listener; },
        };
        addAudienceSocket(broken as any);
        try {
            send(haptic('evt-1'));
            const ack = await acks.next();
            expect(ack.status).toBe(202);
            expect(ack.deliveredTo).toBe(1);
            expect(await received.next()).toEqual([haptic('evt-1')]);
        } finally {
            // Remove it from the hub, which is shared across tests.
            closeBroken();
        }
    });
});
