import { z } from 'zod';
import 'dotenv/config';

// No valid event serializes larger than this, even with every string field at its maximum
// length and written as escaped Unicode. Used to keep the frame size limit above any valid frame.
const MAX_VALID_EVENT_BYTES = 8 * 1024;

const envSchema = z.object({
    SITE_DOMAIN: z.string().default('localhost'),
    PORT: z.coerce.number().default(3000), // Automatically forces string "3000" to number 3000
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    // The most events one performer frame can carry. Larger lists get a 422 ack.
    MAX_EVENTS_PER_FRAME: z.coerce.number().int().positive().default(500),
    // The largest performer frame the socket accepts; a bigger one closes the connection with code 1009.
    // Only a safeguard against runaway frames, so it must stay above the largest valid frame.
    MAX_FRAME_BYTES: z.coerce.number().int().positive().default(8 * 1024 * 1024),
}).superRefine((env, ctx) => {
    const minFrameBytes = env.MAX_EVENTS_PER_FRAME * MAX_VALID_EVENT_BYTES;
    if (env.MAX_FRAME_BYTES < minFrameBytes) {
        ctx.addIssue({
            code: 'custom',
            path: ['MAX_FRAME_BYTES'],
            message: `MAX_FRAME_BYTES must be at least ${minFrameBytes} (MAX_EVENTS_PER_FRAME x ${MAX_VALID_EVENT_BYTES}) ` +
                'so a valid frame never closes the connection.',
        });
    }
});

export const env = envSchema.parse(process.env);
