import { APIAck, APIAckRejection, eventsAck } from "../../../api-schemas/baseEvent.api.schema";
import { EventInferredType, ShowEventInferredType } from "../../../api-schemas/baseEventMessage.api.schema";
import relayPerformerHandler from "./relay.performer.handler";

/**
 * Handle the valid events from one performer frame and build the frame's single ack.
 * Show events are relayed to the audience together, in frame order, as one list.
 */
export default function performerEventHandler(events: EventInferredType[], rejected: APIAckRejection[]): APIAck {
    const accepted: string[] = [];
    const toRelay: ShowEventInferredType[] = [];
    for (const event of events) {
        accepted.push(event.eventId);
        switch (event.type) {
            // Ping only checks the connection between Max and the server, so it is never relayed.
            case 'ping':
                break;
            case 'audio':
            case 'caption':
            case 'color':
            case 'haptic':
            case 'image':
            case 'start':
            case 'torch':
            case 'video':
                toRelay.push(event);
                break;
            default: {
                const _unreachable: never = event;
                break;
            }
        }
    }

    const { deliveredTo, error } = relayPerformerHandler(toRelay);
    return eventsAck({ accepted, rejected, relayed: toRelay.length, deliveredTo, broadcastError: error });
}
