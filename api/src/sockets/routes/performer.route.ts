import { FastifyInstance } from "fastify";
import performerEventHandler from "../handlers/performer/main.performer.handler";
import { validateEvent } from "../validators/validateEvent";

export async function performerRoute(app: FastifyInstance) {
    app.get('/performer', { websocket: true }, (socket, request) => {
        function send(message: any) {
            socket.send(JSON.stringify(message));
        }
        socket.on('message', (raw:any) => {
            const message = raw.toString();
            console.log('Received message from performer:', message);
            const result = validateEvent(message);
            if (!result.ok) {
                console.error('Rejected performer message:', result.ack);
                send(result.ack);
                return;
            }

            // all is good, send it to the performer event handler
            send(performerEventHandler(result.event));
        });
    });
}
