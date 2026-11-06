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

import { MAX_EVENTS_PER_FRAME } from './baseEvent.api.schema';

// Show events are relayed to the audience; ping stays between the performer and the server.
const showEvents = [
    APIAudioEvent.route.payload,
    APICaptionEvent.route.payload,
    APIColorEvent.route.payload,
    APIHapticEvent.route.payload,
    APIImageEvent.route.payload,
    APIStartEvent.route.payload,
    APITorchEvent.route.payload,
    APIVideoEvent.route.payload,
] as const;

export const ShowEventType = z.discriminatedUnion('type', showEvents);
export type ShowEventInferredType = z.infer<typeof ShowEventType>;

export const EventType = z.discriminatedUnion('type', [...showEvents, APIPingEvent.route.payload]);
// also export its inferred type.
export type EventInferredType = z.infer<typeof EventType>;

/**
 * What the performer sends in one frame: a single event or a list of them. Used for the
 * AsyncAPI docs; validateFrame checks a frame event by event so one bad event isn't fatal.
 */
export const PerformerFrame = z.union([EventType, z.array(EventType).min(1).max(MAX_EVENTS_PER_FRAME)]);

/**
 * What an audience device receives in one frame: the same form the performer sent,
 * a lone show event or a list of the valid ones.
 */
export const AudienceFrame = z.union([ShowEventType, z.array(ShowEventType).min(1).max(MAX_EVENTS_PER_FRAME)]);
