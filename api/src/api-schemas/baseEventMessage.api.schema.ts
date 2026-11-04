import { z } from 'zod';
import { APIPingEvent } from "./events/pingEvent.api.schema";
import { APIColorEvent } from './events/colorEvent.api.schema';
import { APIAudioEvent } from './events/audioEvent.api.schema';
import { APICaptionEvent } from './events/captionEvent.api.schema';
import { APIHapticEvent } from './events/hapticEvent.api.schema';
import { APIImageEvent } from './events/imageEvent.api.schema';
import { APITorchEvent } from './events/torchEvent.api.schema';
import { APIStartEvent } from './events/startEvent.api.schema';
import { APIVideoEvent } from './events/videoEvent.api.schema';

export const EventType = z.discriminatedUnion('type', [
    APIAudioEvent.route.payload,
    APICaptionEvent.route.payload,
    APIColorEvent.route.payload,
    APIHapticEvent.route.payload,
    APIImageEvent.route.payload,
    APIPingEvent.route.payload,
    APIStartEvent.route.payload,
    APITorchEvent.route.payload,
    APIVideoEvent.route.payload,
]);
// also export its inferred type.
export type EventInferredType = z.infer<typeof EventType>;
