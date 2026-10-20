import { z } from 'zod';

export class APIHelloWorld {
  static readonly route = {
    // The docs generator needs a summary or operationId to name the page.
    summary: 'Hello world',
    operationId: 'helloWorld',
    response: {
      200: z.object({
        message: z.string(),
      }),
    },
  } as const;
}

export type APIHelloWorldResponse200 = z.infer<typeof APIHelloWorld.route.response[200]>;
