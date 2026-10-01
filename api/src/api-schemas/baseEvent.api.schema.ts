import { z } from 'zod';
// This one's a little different because it's a websocket event, not a REST API route.
// But the same principles apply: we define the schema for the event's payload and response,
// and then we can use Zod to validate incoming data and infer TypeScript types.
//
// Two things differ from a REST schema:
//   - `payload` instead of `body`, since a socket frame has no HTTP body.
//   - the response keys are the ack status codes from the handshake strategy
//     (202/400/422/500) rather than HTTP statuses, because every inbound event
//     is answered with one ack.

/** Milliseconds since the Unix epoch. */
const EpochMs = z.number().int().nonnegative();

/** A duration in ms. Capped so a patch sending seconds is caught, not scaled. */
export const DurationMs = z.number().int().min(0).max(600_000);

/** An asset alias, resolved against the aliases registered for the session. */
export const AssetAlias = z.string().min(1).max(200);

/**
 * Envelope fields every event carries. Spread into each concrete event schema
 * rather than `.extend()`ed, so the result stays a plain ZodObject and
 * z.discriminatedUnion can still narrow on `type`.
 */
export const eventEnvelope = {
  schemaVersion: z.literal('1.0'),
  eventId: z.string().min(1).max(200),
  sequence: z.number().int().nonnegative(),
  sentTimestamp: EpochMs,
  execTimestamp: EpochMs,
} as const;

/**
 * Compose one event type from the shared envelope and its payload.
 *
 * `.strict()` means an unknown key is a rejection rather than silently
 * forwarded traffic — which is what catches `target` and `keyframes` while
 * zone targeting is still a planned extension.
 *
 * `const T extends string` keeps the literal type ('haptic', not string) so the
 * union in eventMessage.api.schema.ts actually discriminates.
 */
export const defineEvent = <const T extends string, P extends z.ZodTypeAny>(
  type: T,
  payload: P,
) => z.object({ ...eventEnvelope, type: z.literal(type), payload }).strict();

export class APIBaseEvent {
  static readonly route = {
    // The envelope the composer sends. Concrete event schemas narrow `type`
    // and `payload`; this is the shape they all share.
    payload: z.object({
      ...eventEnvelope,
      type: z.string(),
      data: z.unknown(),
    }),
    // The ack the server sends back after processing the event.
    response: {
      // Accepted and fanned out to devices.
      202: z.object({
        type: z.literal('ack'),
        eventId: z.string(),
        status: z.literal(202),
      }),
      // Not parseable as JSON.
      400: z.object({
        type: z.literal('ack'),
        eventId: z.string(),
        status: z.literal(400),
        error: z.array(z.string()),
      }),
      // Well-formed, but invalid for the schema or the session.
      422: z.object({
        type: z.literal('ack'),
        eventId: z.string(),
        status: z.literal(422),
        error: z.array(z.string()),
      }),
      // Accepted but we failed to distribute it.
      500: z.object({
        type: z.literal('ack'),
        eventId: z.string(),
        status: z.literal(500),
        error: z.array(z.string()),
      }),
    },
  } as const;
}

export type APIBaseEventPayload = z.infer<typeof APIBaseEvent.route.payload>;
export type APIBaseEventResponse202 = z.infer<typeof APIBaseEvent.route.response[202]>;
export type APIBaseEventResponse400 = z.infer<typeof APIBaseEvent.route.response[400]>;
export type APIBaseEventResponse422 = z.infer<typeof APIBaseEvent.route.response[422]>;
export type APIBaseEventResponse500 = z.infer<typeof APIBaseEvent.route.response[500]>;

/** Any ack, whatever the status. */
export type APIAck =
  | APIBaseEventResponse202
  | APIBaseEventResponse400
  | APIBaseEventResponse422
  | APIBaseEventResponse500;

/** Used when eventId can't be recovered from a malformed frame. */
export const UNKNOWN_EVENT_ID = 'unknown';

export function ack(eventId: string, status: 202): APIBaseEventResponse202;
export function ack(eventId: string, status: 400 | 422 | 500, error: string[]): APIAck;
export function ack(eventId: string, status: 202 | 400 | 422 | 500, error?: string[]): APIAck {
  return status === 202
    ? { type: 'ack', eventId, status }
    : { type: 'ack', eventId, status, error: error ?? [] } as APIAck;
}