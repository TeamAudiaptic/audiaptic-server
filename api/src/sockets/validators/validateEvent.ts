import { APIAck, APIAckRejection, eventEnvelope, frameAck } from "../../api-schemas/baseEvent.api.schema";
import { EventInferredType, EventType } from "../../api-schemas/baseEventMessage.api.schema";

export type ValidatedFrame =
    // isList records whether the performer sent a list, so the audience receives the same form.
    | { ok: true; events: EventInferredType[]; rejected: APIAckRejection[]; isList: boolean }
    | { ok: false; ack: APIAck };

type ValidatedEvent =
    | { ok: true; event: EventInferredType }
    | { ok: false; rejection: APIAckRejection };

/**
 * Validate a raw performer frame: a single event or a non-empty list of events.
 *
 * Each event is validated on its own, so one bad event doesn't stop the rest.
 * Within the frame, an eventId already used by an earlier event is rejected.
 *
 * @returns the valid events (in frame order) and the rejections, or the ack to
 * send back when the frame can't be read as events at all:
 * 400 if it isn't JSON, 422 if it isn't an event or a non-empty list.
 */
export function validateFrame(raw: string): ValidatedFrame {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return { ok: false, ack: frameAck(400, ['The frame is not valid JSON.']) };
    }

    // A lone event is validated and acked as a list of one.
    const isList = Array.isArray(parsed);
    const items = Array.isArray(parsed) ? parsed
        : typeof parsed === 'object' && parsed !== null ? [parsed]
        : null;
    if (items === null) {
        return { ok: false, ack: frameAck(422, ['A frame must be an event object or a list of event objects.']) };
    }
    if (items.length === 0) {
        return { ok: false, ack: frameAck(422, ['A frame must contain at least one event.']) };
    }

    const events: EventInferredType[] = [];
    const rejected: APIAckRejection[] = [];
    const seenIds = new Set<string>();
    items.forEach((item, index) => {
        const result = validateEvent(item, index, seenIds);
        if (result.ok) {
            events.push(result.event);
        } else {
            rejected.push(result.rejection);
        }
    });
    return { ok: true, events, rejected, isList };
}

/** Validate one event from a frame, recording its eventId so a later duplicate is caught. */
function validateEvent(item: unknown, index: number, seenIds: Set<string>): ValidatedEvent {
    // Reuse the envelope's own eventId rule so the ack can name the event even when the rest is invalid.
    const id = eventEnvelope.eventId.safeParse((item as { eventId?: unknown } | null)?.eventId);
    const eventId = id.success ? id.data : null;

    if (eventId !== null) {
        if (seenIds.has(eventId)) {
            return { ok: false, rejection: { index, eventId, errors: [`Duplicate eventId: an earlier event in this frame already uses "${eventId}".`] } };
        }
        seenIds.add(eventId);
    }

    const result = EventType.safeParse(item);
    if (!result.success) {
        const errors = result.error.issues.map(issue => `Field ${issue.path.join('.') || '(root)'} - ${issue.message}`);
        return { ok: false, rejection: { index, eventId, errors } };
    }
    return { ok: true, event: result.data };
}
