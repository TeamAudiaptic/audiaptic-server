import { z } from 'zod';

// Define the structural Zod schema wrapper
export const APIError = z.object({
  error: z.string(),
});

// Infer the TypeScript type from the Zod schema cleanly
export type APIErrorType = z.infer<typeof APIError>;

// This must return a Zod schema, not a plain object literal
export function createAPIError(defaultMessage: string) {
  return z.object({
    error: z.string().default(defaultMessage),
  });
}
