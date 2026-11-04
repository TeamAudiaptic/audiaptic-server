import { z } from 'zod';
import { defineEvent } from '../baseEvent.api.schema';

export class APIStartEvent {
  static readonly route = {
    // Start has no payload; `{}` is still accepted so a generic event patch can send one.
    payload: defineEvent('start', z.object({}).optional()),
  } as const;
}

export type APIStartEventPayload = z.infer<typeof APIStartEvent.route.payload>;
