import { z } from 'zod';
import { defineEvent, DurationMs, AssetAlias } from '../baseEvent.api.schema';

export class APIPingEvent {
  static readonly route = {
    payload: defineEvent('ping', z.object({

    })),
  } as const;
}

export type APIPingEventPayload = z.infer<typeof APIPingEvent.route.payload>;