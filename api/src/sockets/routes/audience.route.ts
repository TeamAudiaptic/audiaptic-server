import { FastifyInstance } from "fastify";
import { addAudienceSocket, audienceCount } from "../audience.hub";

// 'davhi' stands in for a performance join code until joining with a code is implemented.
const VALID_CODES = new Set(['davhi']);

// Close codes 4000-4999 are reserved for applications. Clients read these from the close event;
// they can't read the HTTP status of a rejected upgrade, so the socket is accepted and then closed.
export const INVALID_CODE_CLOSE = { code: 4404, reason: 'Invalid join code' } as const;

export async function audienceRoute(app: FastifyInstance) {
    app.get<{ Params: { code: string } }>('/audience/:code', { websocket: true }, (socket, request) => {
        const { code } = request.params;
        if (!VALID_CODES.has(code)) {
            console.log(`Rejected audience device with invalid join code: ${code}`);
            socket.close(INVALID_CODE_CLOSE.code, INVALID_CODE_CLOSE.reason);
            return;
        }

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
