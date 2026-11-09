import { z } from 'zod';

export class APITime {
  static readonly route = {
    // The docs generator needs a summary or operationId to name the page.
    summary: 'Get current time',
    operationId: 'getCurrentTime',
    response: {
      200: z.object({
        serverTimestamp: z.number().int().nonnegative(),
  }),
    },
  } as const;
}

export type APITimeResponse200 = z.infer<typeof APITime.route.response[200]>;
