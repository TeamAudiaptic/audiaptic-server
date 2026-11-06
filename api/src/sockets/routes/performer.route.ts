import { FastifyInstance } from "fastify";
import performerEventHandler from "../handlers/performer/main.performer.handler";
import { validateFrame } from "../validators/validateEvent";

export async function performerRoute(app: FastifyInstance) {
    app.get('/performer', { websocket: true }, (socket, request) => {
        function send(message: any) {
            socket.send(JSON.stringify(message));
        }
        socket.on('message', (raw:any) => {
            const message = raw.toString();
            console.log('Received message from performer:', message);
            const result = validateFrame(message);
            if (!result.ok) {
                console.error('Rejected performer frame:', result.ack);
                send(result.ack);
                return;
            }
            if (result.rejected.length > 0) {
                console.error('Rejected events in performer frame:', result.rejected);
            }

            // Handling is synchronous, so acks go back in the same order the frames arrived.
            send(performerEventHandler(result.events, result.rejected, result.isList));
        });
    });
}
