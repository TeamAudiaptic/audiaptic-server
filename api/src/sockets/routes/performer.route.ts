import { FastifyInstance } from "fastify";
import performerEventHandler from "../handlers/performer/main.performer.handler";
import { ack, UNKNOWN_EVENT_ID } from "../../api-schemas/baseEvent.api.schema";
import { EventInferredType, EventType } from "../../api-schemas/baseEventMessage.api.schema";

export async function performerRoute(app: FastifyInstance) { 
    app.get('/performer', { websocket: true }, (socket, request) => {
        function send(message: any) {
            socket.send(JSON.stringify(message));
        }
        socket.on('message', (raw:any) => {
            const message = raw.toString();
            console.log('Received message from performer:', message);
            let parsedMessage;
            try {
                parsedMessage = JSON.parse(message);
            } catch (error) {
                console.error('Failed to parse message as JSON:', error);
                send(ack(UNKNOWN_EVENT_ID, 400, ['I couldn\'t understand the message you sent! Was it valid JSON?']));
                return;
            }
            const parsedEvent = EventType.safeParse(parsedMessage);
            if (!parsedEvent.success) {
                console.error('Failed to parse event:', parsedEvent.error);
                // If the event is malformed, we send an error message back to the client.
                let errors = ['The event you sent is malformed.'];
                if (parsedEvent.error.issues) {
                    errors.push(...parsedEvent.error.issues.map(issue => `Field ${issue.path.join('.')} - ${issue.message}`));
                }
                send(ack(UNKNOWN_EVENT_ID, 422, errors));
                return;
            }
            
            // all is good, send it to the performer event handler!
            const response = performerEventHandler(parsedEvent.data);
            send(response);
        });
    });
}