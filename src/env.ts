import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
    SITE_DOMAIN: z.string().default('localhost'),
    PORT: z.coerce.number().default(3000), // Automatically forces string "3000" to number 3000
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export const env = envSchema.parse(process.env);
