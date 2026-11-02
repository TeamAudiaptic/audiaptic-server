
import { z } from 'zod';
import { defineEvent, DurationMs, AssetAlias } from '../baseEvent.api.schema';

export class APITorchEvent {
  static readonly route = {
    payload: defineEvent('torch', z.object({
      durationMs: DurationMs,
      intensity: z.number().min(0).max(1),
      transitionMs: DurationMs,
    })),
  } as const;
}


export type APITorchEventPayload = z.infer<typeof APITorchEvent.route.payload>;