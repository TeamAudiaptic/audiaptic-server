import { z } from 'zod';
import { defineEvent, DurationMs } from '../baseEvent.api.schema';


export class APIColorEvent {
  static readonly route = {
    payload: defineEvent('color', z.object({
      // #RGB, #RRGGBB or #RRGGBBAA.
      color: z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/),
      durationMs: DurationMs,
      transitionMs: DurationMs,
    })),
  } as const;
}


export type APIColorEventPayload = z.infer<typeof APIColorEvent.route.payload>;