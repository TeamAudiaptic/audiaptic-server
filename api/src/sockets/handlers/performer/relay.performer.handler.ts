import { ShowEventInferredType } from "../../../api-schemas/baseEventMessage.api.schema";
import { broadcastToAudience } from "../../audience.hub";

export type RelayResult = { deliveredTo: number; error?: string };

/**
 * Send a frame's show events to the audience. A list from the performer goes out as a list,
 * even if only one of its events was valid; a lone event goes out as that event.
 * Sends nothing when there are no events.
 */
export default function relayPerformerHandler(events: ShowEventInferredType[], isList: boolean): RelayResult {
    if (events.length === 0) {
        return { deliveredTo: 0 };
    }
    try {
        const deliveredTo = broadcastToAudience(isList ? events : events[0]);
        console.log(`Relayed ${events.length} event(s) to ${deliveredTo} audience device(s).`);
        return { deliveredTo };
    } catch (error) {
        console.error('Failed to relay events to audience:', error);
        return { deliveredTo: 0, error: 'The events were valid, but the server failed to send them to the audience.' };
    }
}
