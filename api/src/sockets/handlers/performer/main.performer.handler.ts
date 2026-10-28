import { ack, APIAck, UNKNOWN_EVENT_ID } from "../../../api-schemas/baseEvent.api.schema";
import { EventInferredType } from "../../../api-schemas/baseEventMessage.api.schema";
import pingPerformerHandler from "./ping.performer.handler";

export default function performerEventHandler(event: EventInferredType): APIAck {
    switch (event.type) {
        case 'ping':
            return pingPerformerHandler(event);
        // Show events can be relayed with relayPerformerHandler, but the client
        // can't act on them yet, so they stay unimplemented until it can.
        case 'audio':
            return ack(event.eventId, 422, [`Event ${event.type} is not yet implemented!`]);
        case 'caption':
            return ack(event.eventId, 422, [`Event ${event.type} is not yet implemented!`]);
        case 'color':
            return ack(event.eventId, 422, [`Event ${event.type} is not yet implemented!`]);
        case 'haptic':
            return ack(event.eventId, 422, [`Event ${event.type} is not yet implemented!`]);
        case 'image':
            return ack(event.eventId, 422, [`Event ${event.type} is not yet implemented!`]);
        case 'torch':
            return ack(event.eventId, 422, [`Event ${event.type} is not yet implemented!`]);
        default:
            const _unreachable: never = event;
            return ack(UNKNOWN_EVENT_ID, 400, [`Fatal error: The event type was not recognized. This should never happen!`]);
    }
}