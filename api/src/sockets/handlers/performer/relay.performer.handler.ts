import { ShowEventInferredType } from "../../../api-schemas/baseEventMessage.api.schema";
import { broadcastToAudience } from "../../audience.hub";

export type RelayResult = { deliveredTo: number; error?: string };

/** Send a frame's show events to the audience as one list. Sends nothing when there are none. */
export default function relayPerformerHandler(events: ShowEventInferredType[]): RelayResult {
    if (events.length === 0) {
        return { deliveredTo: 0 };
    }
    try {
        const deliveredTo = broadcastToAudience(events);
        console.log(`Relayed ${events.length} event(s) to ${deliveredTo} audience device(s).`);
        return { deliveredTo };
    } catch (error) {
        console.error('Failed to relay events to audience:', error);
        return { deliveredTo: 0, error: 'The events were valid, but the server failed to send them to the audience.' };
    }
}
