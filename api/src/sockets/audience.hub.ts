import type { WebSocket } from "@fastify/websocket";
import { EventInferredType } from "../api-schemas/baseEventMessage.api.schema";

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
 * Send an already-validated event to every open audience socket.
 *
 * @returns how many devices it was sent to.
 */
export function broadcastToAudience(event: EventInferredType): number {
    // Stringify once, not once per device.
    const message = JSON.stringify(event);
    let sent = 0;
    for (const socket of audienceSockets) {
        // A socket that is still connecting or already closing can't take the frame.
        if (socket.readyState !== socket.OPEN) {
            continue;
        }
        socket.send(message);
        sent += 1;
    }
    return sent;
}
