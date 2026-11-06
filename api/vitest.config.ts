import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Pin the frame limits to their defaults so a local .env can't change what the tests expect.
        env: {
            MAX_EVENTS_PER_FRAME: '500',
            MAX_FRAME_BYTES: String(8 * 1024 * 1024),
        },
    },
});
