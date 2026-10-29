import { FastifyInstance } from "fastify";
import { addAudienceSocket, audienceCount } from "../audience.hub";

export async function audienceRoute(app: FastifyInstance) {
    // 'davhi' stands in for a performance join code until joining with a code is implemented.
    app.get('/audience/davhi', { websocket: true }, (socket, request) => {
        addAudienceSocket(socket);
        console.log(`Audience device connected. ${audienceCount()} connected.`);

        socket.on('close', () => {
            console.log(`Audience device disconnected. ${audienceCount()} connected.`);
        });

        // Events only flow performer -> audience for now, so anything a device sends is ignored.
        socket.on('message', (raw: any) => {
            console.log('Ignoring message from audience device:', raw.toString());
        });
    });
}
