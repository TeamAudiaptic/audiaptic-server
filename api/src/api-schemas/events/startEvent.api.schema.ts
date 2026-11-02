import { z } from 'zod';
import { defineEvent } from '../baseEvent.api.schema';

export class APIStartEvent {
  static readonly route = {
    payload: defineEvent('start', z.object({

    })),
  } as const;
}

export type APIStartEventPayload = z.infer<typeof APIStartEvent.route.payload>;
