import { z } from 'zod';
import { defineEvent, DurationMs } from '../baseEvent.api.schema';

export class APIHapticEvent {
  static readonly route = {
    payload: defineEvent('haptic', z.object({
      intensity: z.number().min(0).max(1),
      sharpness: z.number().min(0).max(1),
      durationMs: DurationMs,
      transitionMs: DurationMs,
    })),
  } as const;
}


export type APIHapticEventPayload = z.infer<typeof APIHapticEvent.route.payload>;