import { z } from 'zod';
import { AssetAlias, defineEvent, DurationMs } from '../baseEvent.api.schema';

export class APIVideoEvent {
  static readonly route = {
    payload: defineEvent('video', z.object({
      assetAlias: AssetAlias,
      startOffsetMs: DurationMs.optional(),
      durationMs: DurationMs.optional(),
      loop: z.coerce.boolean().optional(),
      transitionMs: DurationMs.optional(),
    })),
  } as const;
}


export type APIVideoEventPayload = z.infer<typeof APIVideoEvent.route.payload>;
