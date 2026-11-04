import { z } from 'zod';
// This one's a little different because it's a websocket event, not a REST API route.
// But the same principles apply: we define the schema for the event's payload and response,
// and then we can use Zod to validate incoming data and infer TypeScript types.
//
// Two things differ from a REST schema:
//   - `payload` instead of `body`, since a socket frame has no HTTP body.
//   - the response is a single ack whose `status` field carries the outcome
//     (200/202/207/400/422/500) rather than an HTTP status, because every inbound
//     frame, whether one event or a list, is answered with exactly one ack.

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
  relativeTimestamp: z.number().int().nonnegative().optional(),
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

/** The most events one frame can carry. */
export const MAX_EVENTS_PER_FRAME = 500;

/**
 * The largest frame the socket accepts. A bigger frame closes the connection with code 1009.
 * This only protects the server from a runaway frame: it sits well above the largest valid
 * frame (500 events at their maximum field lengths is about 3.5 MB), so MAX_EVENTS_PER_FRAME
 * is the limit a performer actually reaches.
 */
export const MAX_FRAME_BYTES = 8 * 1024 * 1024;

/** One event the server refused, located by its position in the frame. */
export const AckRejection = z.object({
  // Zero-based position in the frame; a lone event is index 0.
  index: z.number().int().nonnegative(),
  // null when the event's eventId couldn't be read.
  eventId: z.string().nullable(),
  errors: z.array(z.string()),
});

export class APIBaseEvent {
  static readonly route = {
    // The envelope the composer sends. Concrete event schemas narrow `type`
    // and `payload`; this is the shape they all share.
    payload: z.object({
      ...eventEnvelope,
      type: z.string(),
      data: z.unknown(),
    }),
    // The one ack the server sends back for each frame, whether it held one event or a list.
    response: z.object({
      type: z.literal('ack'),
      status: z.literal([200, 202, 207, 400, 422, 500]),
      // eventIds that passed validation, in frame order. Includes pings, which are never relayed.
      accepted: z.array(z.string()),
      rejected: z.array(AckRejection),
      // How many audience devices the frame was sent to.
      deliveredTo: z.number().int().nonnegative(),
      // Problems with the frame as a whole rather than with one event.
      errors: z.array(z.string()),
    }),
  } as const;
}

export type APIBaseEventPayload = z.infer<typeof APIBaseEvent.route.payload>;
export type APIAck = z.infer<typeof APIBaseEvent.route.response>;
export type APIAckStatus = APIAck['status'];
export type APIAckRejection = z.infer<typeof AckRejection>;

/** What each status means. Mirrors the status table in the docs' Acknowledgements page. */
export const ackStatusSummaries: Record<APIAckStatus, string> = {
  200: 'Every event was valid, and there was nothing to relay (for example, only pings).',
  202: 'Every event was valid, and the show events were relayed.',
  207: 'Partial success: the valid show events were relayed, and the invalid ones are listed in `rejected`.',
  400: 'The frame is not valid JSON.',
  422: 'The frame is not an event or a list of 1-500 events, or no event in it is valid. Nothing was relayed.',
  500: 'The events were valid, but the server failed to send them to the audience.',
};

/** Ack for a frame that couldn't be read as events at all, so nothing in it was processed. */
export function frameAck(status: 400 | 422, errors: string[]): APIAck {
  return { type: 'ack', status, accepted: [], rejected: [], deliveredTo: 0, errors };
}

/**
 * Ack for a frame whose events were read. The status follows the order in the
 * docs: nothing valid (422), failed broadcast (500), partial (207), relayed (202),
 * nothing to relay (200).
 */
export function eventsAck(result: {
  accepted: string[];
  rejected: APIAckRejection[];
  relayed: number;
  deliveredTo: number;
  broadcastError?: string;
}): APIAck {
  const { accepted, rejected, relayed, deliveredTo, broadcastError } = result;
  const status: APIAckStatus =
    accepted.length === 0 ? 422
    : broadcastError ? 500
    : rejected.length > 0 ? 207
    : relayed > 0 ? 202
    : 200;
  return { type: 'ack', status, accepted, rejected, deliveredTo, errors: broadcastError ? [broadcastError] : [] };
}
