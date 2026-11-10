// The portal is built separately from the API, so it can't import the API's Zod schemas.
// These definitions mirror api/src/api-schemas/events closely enough to build a form.
// The server stays the only validator, which is what lets the simulator send invalid events on purpose.

export const eventTypes = [
  'audio',
  'caption',
  'color',
  'haptic',
  'image',
  'ping',
  'start',
  'torch',
  'video',
] as const

export type EventTypeName = (typeof eventTypes)[number]

export type FieldDef = {
  name: string
  kind: 'text' | 'color' | 'number' | 'boolean'
  required: boolean
  // Form inputs hold strings; buildPayload converts them
  initial: string
  hint: string
  min?: number
  max?: number
  step?: number
}

const duration = (name: string, required: boolean, initial = ''): FieldDef => ({
  name,
  kind: 'number',
  required,
  initial,
  hint: '0 to 600000 ms',
  min: 0,
  max: 600_000,
  step: 1,
})

const intensity = (initial: string): FieldDef => ({
  name: 'intensity',
  kind: 'number',
  required: true,
  initial,
  hint: '0 to 1',
  min: 0,
  max: 1,
  step: 0.05,
})

const assetAlias = (initial: string): FieldDef => ({
  name: 'assetAlias',
  kind: 'text',
  required: true,
  initial,
  hint: '1 to 200 characters',
})

// Audio and video share a payload
const playback = (alias: string): FieldDef[] => [
  assetAlias(alias),
  duration('startOffsetMs', false),
  duration('durationMs', false),
  { name: 'loop', kind: 'boolean', required: false, initial: '', hint: '' },
  duration('transitionMs', false),
]

export const eventFields: Record<EventTypeName, FieldDef[]> = {
  audio: playback('sample-audio'),
  caption: [
    {
      name: 'text',
      kind: 'text',
      required: true,
      initial: 'Hello from the Max simulator',
      hint: 'Up to 500 characters. Empty clears the caption.',
    },
    duration('durationMs', false, '3000'),
  ],
  color: [
    {
      name: 'color',
      kind: 'color',
      required: true,
      initial: '#aa3bff',
      hint: '#RGB, #RRGGBB, or #RRGGBBAA',
    },
    duration('durationMs', true, '1000'),
    duration('transitionMs', true, '0'),
  ],
  haptic: [intensity('0.5'), duration('durationMs', true, '500'), duration('transitionMs', true, '0')],
  image: [assetAlias('sample-image'), duration('durationMs', false), duration('transitionMs', false)],
  ping: [],
  start: [],
  torch: [duration('durationMs', true, '500'), intensity('1'), duration('transitionMs', true, '0')],
  video: playback('sample-video'),
}

export type FormValues = Record<EventTypeName, Record<string, string>>

export function initialValues(): FormValues {
  return Object.fromEntries(
    eventTypes.map((type) => [
      type,
      Object.fromEntries(eventFields[type].map((field) => [field.name, field.initial])),
    ]),
  ) as FormValues
}

// A blank number or unset boolean is left out, so a blank required field reaches the server
// as a missing field. Text is always sent, because an empty caption is meaningful.
export function buildPayload(type: EventTypeName, values: Record<string, string>) {
  const payload: Record<string, unknown> = {}
  for (const field of eventFields[type]) {
    const value = values[field.name] ?? ''
    if (field.kind === 'text' || field.kind === 'color') {
      payload[field.name] = value
    } else if (value.trim() !== '') {
      payload[field.name] = field.kind === 'number' ? Number(value) : value === 'true'
    }
  }
  return payload
}

export type TimingMode = 'immediate' | 'epoch' | 'relative'

export type Timing = { mode: TimingMode; ms: number }

// An event before it is sent: everything but the envelope fields Max sets when sending
export type EventDraft = {
  type: EventTypeName
  payload: Record<string, unknown>
  timing: Timing
}

export function describeTiming(timing: Timing): string {
  if (timing.mode === 'epoch') return `${timing.ms} ms after sending`
  if (timing.mode === 'relative') return `${timing.ms} ms after start`
  return 'immediately'
}

// Makes eventIds unique across page loads, not just within one
const RUN_ID = Date.now().toString(36)

// Fill in the envelope the way Max does at the moment of sending
export function stampEvent(draft: EventDraft, sequence: number, now = Date.now()) {
  return {
    schemaVersion: '1.0',
    eventId: `sim-${RUN_ID}-${sequence}`,
    sequence,
    sentTimestamp: now,
    epochTimestamp: draft.timing.mode === 'epoch' ? now + draft.timing.ms : null,
    ...(draft.timing.mode === 'relative' ? { relativeTimestamp: draft.timing.ms } : {}),
    type: draft.type,
    payload: draft.payload,
  }
}

type MakeEvent = (
  type: EventTypeName,
  payload: Record<string, unknown>,
) => ReturnType<typeof stampEvent>

export type ErrorPreset = {
  name: string
  detail: string
  // The ack status the server should answer with
  expects: number
  build: (make: MakeEvent) => string
}

export const errorPresets: ErrorPreset[] = [
  {
    name: 'Malformed JSON',
    detail: 'A frame cut off partway through.',
    expects: 400,
    build: () => '{"type": "color", "payload": ',
  },
  {
    name: 'Empty list',
    detail: 'A list with no events in it.',
    expects: 422,
    build: () => '[]',
  },
  {
    name: 'Duplicate eventId',
    detail: 'Two valid captions sharing one eventId. The second is rejected.',
    expects: 207,
    build: (make) => {
      const first = make('caption', { text: 'First caption' })
      const second = { ...make('caption', { text: 'Second caption' }), eventId: first.eventId }
      return JSON.stringify([first, second])
    },
  },
  {
    name: 'Out-of-range payload',
    detail: 'A valid caption next to a haptic with intensity 2.',
    expects: 207,
    build: (make) =>
      JSON.stringify([
        make('caption', { text: 'Valid caption' }),
        make('haptic', { intensity: 2, durationMs: 100, transitionMs: 0 }),
      ]),
  },
]

// Short forms of ackStatusSummaries in api/src/api-schemas/baseEvent.api.schema.ts
export const ackSummaries: Record<number, string> = {
  200: 'Valid, with nothing to relay',
  202: 'Valid and relayed',
  207: 'Partly valid; the valid events were relayed',
  400: 'Not valid JSON',
  422: 'Nothing valid, so nothing was relayed',
  500: 'Valid, but the relay failed',
}
