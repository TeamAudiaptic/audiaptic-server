import { z } from 'zod';

export class APIHelloWorld {
  static readonly route = {
    response: {
      200: z.object({
        message: z.string(),
      }),
    },
  } as const;
}

export type APIHelloWorldResponse200 = z.infer<typeof APIHelloWorld.route.response[200]>;
