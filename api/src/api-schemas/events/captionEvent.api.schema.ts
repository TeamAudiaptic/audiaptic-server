import { z } from 'zod';
import { defineEvent, DurationMs } from '../baseEvent.api.schema';


export class APICaptionEvent {
  static readonly route = {
    payload: defineEvent('caption', z.object({
      // An empty string is meaningful: it clears the caption.
      text: z.string().max(500),
      durationMs: DurationMs.optional(),
    })),
  } as const;
}


export type APICaptionEventPayload = z.infer<typeof APICaptionEvent.route.payload>;