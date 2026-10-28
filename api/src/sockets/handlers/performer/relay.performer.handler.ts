import { ack } from "../../../api-schemas/baseEvent.api.schema";
import { EventInferredType } from "../../../api-schemas/baseEventMessage.api.schema";
import { broadcastToAudience } from "../../audience.hub";

export default function relayPerformerHandler(event: EventInferredType) {
    try {
        const sent = broadcastToAudience(event);
        console.log(`Relayed ${event.type} event ${event.eventId} to ${sent} audience device(s).`);
        return ack(event.eventId, 202);
    } catch (error) {
        console.error('Failed to relay event to audience:', error);
        return ack(event.eventId, 500, ['The event was valid, but the server failed to send it to the audience.']);
    }
}
