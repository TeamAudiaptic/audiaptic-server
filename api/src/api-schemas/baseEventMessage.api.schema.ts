import { z } from 'zod';
import { APIPingEvent } from "./events/pingEvent.api.schema";
import { APIColorEvent } from './events/colorEvent.api.schema';
import { APIAudioEvent } from './events/audioEvent.api.schema';
import { APICaptionEvent } from './events/captionEvent.api.schema';
import { APIHapticEvent } from './events/hapticEvent.api.schema';
import { APIImageEvent } from './events/imageEvent.api.schema';
import { APITorchEvent } from './events/torchEvent.api.schema';

export const EventType = z.discriminatedUnion('type', [
    APIAudioEvent.route.payload,
    APICaptionEvent.route.payload,
    APIColorEvent.route.payload,
    APIHapticEvent.route.payload,
    APIImageEvent.route.payload,
    APIPingEvent.route.payload, // only ping works for now
    APITorchEvent.route.payload,
]);
// also export its inferred type.
export type EventInferredType = z.infer<typeof EventType>;
