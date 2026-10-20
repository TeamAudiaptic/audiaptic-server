import { ack } from "../../../api-schemas/baseEvent.api.schema";
import { APIPingEventPayload } from "../../../api-schemas/events/pingEvent.api.schema";

export default function pingPerformerHandler(event: APIPingEventPayload) {
    return ack(event.eventId, 200);
}