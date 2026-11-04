import type { WebSocket } from "@fastify/websocket";
import { ShowEventInferredType } from "../api-schemas/baseEventMessage.api.schema";

// Every connected audience device. The audience route adds and removes sockets;
// the performer handler broadcasts through it, so the two routes never touch each other.
const audienceSockets = new Set<WebSocket>();

export function addAudienceSocket(socket: WebSocket) {
    audienceSockets.add(socket);
    socket.on('close', () => audienceSockets.delete(socket));
}

export function audienceCount() {
    return audienceSockets.size;
}

/**
 * Send already-validated events to every open audience socket as one list.
 * Devices always receive a list, even when it holds a single event.
 *
 * @returns how many devices it was sent to.
 */
export function broadcastToAudience(events: ShowEventInferredType[]): number {
    // Stringify once, not once per device.
    const message = JSON.stringify(events);
    let sent = 0;
    for (const socket of audienceSockets) {
        // A socket that is still connecting or already closing can't take the frame.
        if (socket.readyState !== socket.OPEN) {
            continue;
        }
        // One device failing shouldn't stop the rest from getting the frame.
        try {
            socket.send(message);
            sent += 1;
        } catch (error) {
            console.error('Failed to send to an audience device:', error);
        }
    }
    return sent;
}
