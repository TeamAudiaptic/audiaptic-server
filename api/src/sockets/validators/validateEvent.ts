import { ack, APIAck, eventEnvelope, UNKNOWN_EVENT_ID } from "../../api-schemas/baseEvent.api.schema";
import { EventInferredType, EventType } from "../../api-schemas/baseEventMessage.api.schema";

export type ValidatedEvent =
    | { ok: true; event: EventInferredType }
    | { ok: false; ack: APIAck };

/**
 * Validate a raw socket frame against the event schemas.
 *
 * @returns the parsed event, or the ack to send back when it is invalid:
 * 400 if the frame isn't JSON, 422 if it doesn't match an event schema.
 */
export function validateEvent(raw: string): ValidatedEvent {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return { ok: false, ack: ack(UNKNOWN_EVENT_ID, 400, ['I couldn\'t understand the message you sent! Was it valid JSON?']) };
    }

    // Reuse the envelope's own eventId rule so the ack can name the event even when the rest is invalid.
    const id = eventEnvelope.eventId.safeParse((parsed as { eventId?: unknown } | null)?.eventId);
    const eventId = id.success ? id.data : UNKNOWN_EVENT_ID;

    const result = EventType.safeParse(parsed);
    if (!result.success) {
        const errors = result.error.issues.map(issue => `Field ${issue.path.join('.') || '(root)'} - ${issue.message}`);
        return { ok: false, ack: ack(eventId, 422, ['The event you sent is malformed.', ...errors]) };
    }
    return { ok: true, event: result.data };
}
