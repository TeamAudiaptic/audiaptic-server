import { ack, APIAck, UNKNOWN_EVENT_ID } from "../../../api-schemas/baseEvent.api.schema";
import { EventInferredType } from "../../../api-schemas/baseEventMessage.api.schema";
import pingPerformerHandler from "./ping.performer.handler";
import relayPerformerHandler from "./relay.performer.handler";

export default function performerEventHandler(event: EventInferredType): APIAck {
    switch (event.type) {
        case 'ping':
            return pingPerformerHandler(event);
        case 'audio':
        case 'caption':
        case 'color':
        case 'haptic':
        case 'image':
        case 'start':
        case 'torch':
        case 'video':
            return relayPerformerHandler(event);
        default:
            const _unreachable: never = event;
            return ack(UNKNOWN_EVENT_ID, 400, [`Fatal error: The event type was not recognized. This should never happen!`]);
    }
}