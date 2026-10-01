import { z } from 'zod';
import { defineEvent, DurationMs, AssetAlias } from '../baseEvent.api.schema';

export class APIAudioEvent {
  static readonly route = {
    payload: defineEvent('audio', z.object({
      assetAlias: AssetAlias,
      startOffsetMs: DurationMs.optional(),
      durationMs: DurationMs.optional(),
      transitionMs: DurationMs.optional(),
    })),
  } as const;
}


export type APIAudioEventPayload = z.infer<typeof APIAudioEvent.route.payload>;