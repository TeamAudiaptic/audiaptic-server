import { z } from 'zod';
import { AssetAlias, defineEvent, DurationMs } from '../baseEvent.api.schema';


export class APIImageEvent {
  static readonly route = {
    payload: defineEvent('image', z.object({
      assetAlias: AssetAlias,
      durationMs: DurationMs.optional(),
      transitionMs: DurationMs.optional(),
    })),
  } as const;
}


export type APIImageEventPayload = z.infer<typeof APIImageEvent.route.payload>;