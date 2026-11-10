import { useEffect, useRef, useState } from 'react'
import {
  ackSummaries,
  buildPayload,
  describeTiming,
  errorPresets,
  eventFields,
  eventTypes,
  initialValues,
  stampEvent,
  type ErrorPreset,
  type EventDraft,
  type EventTypeName,
  type FieldDef,
  type TimingMode,
} from '../maxEvents.ts'
import '../style/MaxSimulator.css'

const RECONNECT_DELAY_MS = 2000

type BatchItem =
  // Stamped when the batch is sent, so each send gets fresh eventIds and timestamps
  | { key: number; source: 'form'; draft: EventDraft }
  // Hand-edited JSON goes into the list exactly as written
  | { key: number; source: 'json'; value: unknown }

type AckBody = {
  status?: number
  accepted?: string[]
  rejected?: { index: number; eventId: string | null; errors: string[] }[]
  deliveredTo?: number
  errors?: string[]
}

type SentFrame = {
  key: number
  sentAt: number
  label: string
  // Exactly what went over the socket
  text: string
  // Why no ack is coming: the frame never left, or the socket closed first
  problem?: string
  ack?: { receivedAt: number; text: string; body?: AckBody }
}

function readAck(data: unknown): SentFrame['ack'] {
  const text = String(data)
  try {
    return { receivedAt: Date.now(), text, body: JSON.parse(text) }
  } catch {
    return { receivedAt: Date.now(), text }
  }
}

// A frame that didn't go out carries the reason as its problem
function newFrame(key: number, label: string, text: string, problem?: string): SentFrame {
  return { key, sentAt: Date.now(), label, text, problem }
}

function pretty(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

function FieldInput(props: { field: FieldDef; value: string; onChange: (value: string) => void }) {
  const { field, value, onChange } = props
  if (field.kind === 'boolean') {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">not set</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    )
  }
  if (field.kind === 'number') {
    return (
      <input
        type="number"
        min={field.min}
        max={field.max}
        step={field.step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }
  if (field.kind === 'color') {
    return (
      <span className="max-sim-color">
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
        {/* The picker only understands #RRGGBB, so the other forms are typed by hand */}
        <input
          type="color"
          aria-label="Pick a color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
        />
      </span>
    )
  }
  return <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
}

function AckSummary({ frame }: { frame: SentFrame }) {
  if (frame.problem) {
    return <p className="max-sim-ack bad">{frame.problem}</p>
  }
  if (!frame.ack) {
    return <p className="max-sim-ack">Waiting for the ack...</p>
  }
  const body = frame.ack.body
  const status = body?.status
  if (body === undefined || status === undefined) {
    return <p className="max-sim-ack bad">The server's reply was not an ack.</p>
  }
  const tone = status === 200 || status === 202 ? 'good' : status === 207 ? 'partial' : 'bad'
  const rejected = body.rejected ?? []
  const errors = body.errors ?? []
  return (
    <>
      <p className={`max-sim-ack ${tone}`}>
        <strong>{status}</strong> {ackSummaries[status]} · {body.accepted?.length ?? 0} accepted ·{' '}
        {rejected.length} rejected · delivered to {body.deliveredTo ?? 0}
      </p>
      {(rejected.length > 0 || errors.length > 0) && (
        <ul className="max-sim-errors">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
          {rejected.map((rejection) => (
            <li key={rejection.index}>
              Event {rejection.index}
              {rejection.eventId && ` (${rejection.eventId})`}: {rejection.errors.join('; ')}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

// Acts as Max: connects to the performer socket, sends events, and shows the ack for each frame
function MaxSimulator({ url }: { url: string }) {
  const [connected, setConnected] = useState(false)
  const [type, setType] = useState<EventTypeName>('color')
  const [values, setValues] = useState(initialValues)
  const [timingMode, setTimingMode] = useState<TimingMode>('immediate')
  const [timingMs, setTimingMs] = useState('2000')
  // The JSON as typed by hand, or null while it follows the form
  const [edited, setEdited] = useState<string | null>(null)
  const [sequence, setSequence] = useState(1)
  // The time the preview is stamped with; the real stamp is taken when sending
  const [clock, setClock] = useState(() => Date.now())
  const [batch, setBatch] = useState<BatchItem[]>([])
  const [keepBatch, setKeepBatch] = useState(false)
  const [problem, setProblem] = useState('')
  const [frames, setFrames] = useState<SentFrame[]>([])

  const socketRef = useRef<WebSocket | null>(null)
  // Keys of sent frames still waiting for an ack, oldest first
  const pendingRef = useRef<number[]>([])
  const nextKeyRef = useRef(0)

  useEffect(() => {
    let socket: WebSocket
    let retry: ReturnType<typeof setTimeout>
    let stopped = false

    const update = (keys: number[], change: Partial<SentFrame>) =>
      setFrames((current) =>
        current.map((frame) => (keys.includes(frame.key) ? { ...frame, ...change } : frame)),
      )

    const connect = () => {
      socket = new WebSocket(url)
      socketRef.current = socket
      socket.onopen = () => setConnected(true)
      // The server answers every frame with one ack, in the order the frames arrived,
      // so each ack belongs to the oldest frame still waiting
      socket.onmessage = (message) => {
        const key = pendingRef.current.shift()
        if (key !== undefined) {
          update([key], { ack: readAck(message.data) })
        }
      }
      // Reconnect so the page survives API restarts while testing
      socket.onclose = () => {
        if (stopped) {
          return
        }
        setConnected(false)
        update(pendingRef.current, { problem: 'The connection closed before an ack arrived.' })
        pendingRef.current = []
        retry = setTimeout(connect, RECONNECT_DELAY_MS)
      }
    }
    connect()

    return () => {
      stopped = true
      clearTimeout(retry)
      socket.close()
    }
  }, [url])

  // Returns whether the frame went out
  const send = (label: string, text: string): boolean => {
    const socket = socketRef.current
    const key = nextKeyRef.current++
    const open = socket !== null && socket.readyState === WebSocket.OPEN
    if (open) {
      socket.send(text)
      pendingRef.current.push(key)
    }
    const frame = newFrame(
      key,
      label,
      text,
      open ? undefined : 'Not sent: the performer socket is not connected.',
    )
    setFrames((current) => [frame, ...current])
    setClock(frame.sentAt)
    return open
  }

  const draft: EventDraft = {
    type,
    payload: buildPayload(type, values[type]),
    timing: { mode: timingMode, ms: Number(timingMs) || 0 },
  }
  const preview = JSON.stringify(stampEvent(draft, sequence, clock), null, 2)

  const sendNow = () => {
    setProblem('')
    if (edited !== null) {
      send('Hand-edited JSON', edited)
    } else if (send(type, JSON.stringify(stampEvent(draft, sequence)))) {
      setSequence(sequence + 1)
    }
  }

  const addToBatch = () => {
    setProblem('')
    const key = nextKeyRef.current++
    if (edited === null) {
      setBatch([...batch, { key, source: 'form', draft }])
      return
    }
    try {
      setBatch([...batch, { key, source: 'json', value: JSON.parse(edited) }])
    } catch {
      setProblem('Only valid JSON can go in a list. To send this text as it is, use Send now.')
    }
  }

  const sendBatch = () => {
    let used = 0
    const events = batch.map((item) =>
      item.source === 'form' ? stampEvent(item.draft, sequence + used++) : item.value,
    )
    const names = batch.map((item) => (item.source === 'form' ? item.draft.type : 'hand-edited'))
    if (!send(`List of ${batch.length} (${names.join(', ')})`, JSON.stringify(events))) {
      return
    }
    setSequence(sequence + used)
    if (!keepBatch) {
      setBatch([])
    }
  }

  const sendPreset = (preset: ErrorPreset) => {
    let used = 0
    const text = preset.build((presetType, payload) =>
      stampEvent({ type: presetType, payload, timing: { mode: 'immediate', ms: 0 } }, sequence + used++),
    )
    if (send(`${preset.name} (expects ${preset.expects})`, text)) {
      setSequence(sequence + used)
    }
  }

  const fields = eventFields[type]

  return (
    <div className="max-sim">
      <p className={`test-session-status${connected ? ' connected' : ''}`}>
        {connected ? 'Connected' : 'Disconnected, retrying...'}
      </p>
      <p className="test-session-meta">
        {url} · next sequence {sequence}
      </p>

      <div className="max-sim-columns">
        <div className="max-sim-panel">
          <h2>Compose event</h2>

          {/* Any form change restamps the preview with the current time */}
          <fieldset
            className="max-sim-form"
            disabled={edited !== null}
            onChange={() => setClock(Date.now())}
          >
            <label className="max-sim-field">
              <span>type</span>
              <select value={type} onChange={(e) => setType(e.target.value as EventTypeName)}>
                {eventTypes.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>

            {fields.length === 0 && <p className="max-sim-note">{type} has no payload fields.</p>}
            {fields.map((field) => (
              <label key={field.name} className="max-sim-field">
                <span>
                  {field.name}
                  {!field.required && ' (optional)'}
                </span>
                <FieldInput
                  field={field}
                  value={values[type][field.name]}
                  onChange={(value) =>
                    setValues({ ...values, [type]: { ...values[type], [field.name]: value } })
                  }
                />
                {field.hint && <small>{field.hint}</small>}
              </label>
            ))}

            <label className="max-sim-field">
              <span>When to run</span>
              <select
                value={timingMode}
                onChange={(e) => setTimingMode(e.target.value as TimingMode)}
              >
                <option value="immediate">Immediately</option>
                <option value="epoch">After a delay (epochTimestamp)</option>
                <option value="relative">Relative to the start event (relativeTimestamp)</option>
              </select>
            </label>
            {timingMode !== 'immediate' && (
              <label className="max-sim-field">
                <span>{timingMode === 'epoch' ? 'Delay after sending' : 'Time after start'} (ms)</span>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={timingMs}
                  onChange={(e) => setTimingMs(e.target.value)}
                />
              </label>
            )}
          </fieldset>

          <textarea
            className="max-sim-json"
            aria-label="Event JSON"
            spellCheck={false}
            rows={14}
            value={edited ?? preview}
            onChange={(e) => setEdited(e.target.value)}
          />
          {edited === null ? (
            <p className="max-sim-note">
              eventId, sequence, and the timestamps are set when the event is sent. Edit the JSON to
              send something the form can't.
            </p>
          ) : (
            <p className="max-sim-note">
              Edited by hand, so the form is paused and this text is sent exactly as written.{' '}
              <button type="button" className="max-sim-link" onClick={() => setEdited(null)}>
                Back to the form
              </button>
            </p>
          )}
          {problem && <p className="max-sim-ack bad">{problem}</p>}

          <div className="max-sim-actions">
            <button type="button" className="max-sim-primary" disabled={!connected} onClick={sendNow}>
              Send now
            </button>
            <button type="button" className="max-sim-secondary" onClick={addToBatch}>
              Add to batch
            </button>
          </div>
        </div>

        <div className="max-sim-side">
          <div className="max-sim-panel">
            <h2>Batch ({batch.length})</h2>
            {batch.length === 0 ? (
              <p className="max-sim-note">Events added to the batch are sent together as one list.</p>
            ) : (
              <ol className="max-sim-batch">
                {batch.map((item) => (
                  <li key={item.key}>
                    <span className="max-sim-batch-text">
                      {item.source === 'form' ? (
                        <>
                          <strong>{item.draft.type}</strong> {JSON.stringify(item.draft.payload)} ·{' '}
                          {describeTiming(item.draft.timing)}
                        </>
                      ) : (
                        <>
                          <strong>hand-edited</strong> {JSON.stringify(item.value)}
                        </>
                      )}
                    </span>
                    <button
                      type="button"
                      className="max-sim-link"
                      onClick={() => setBatch(batch.filter((other) => other.key !== item.key))}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ol>
            )}
            <div className="max-sim-actions">
              <button
                type="button"
                className="max-sim-primary"
                disabled={!connected || batch.length === 0}
                onClick={sendBatch}
              >
                Send batch
              </button>
              <button
                type="button"
                className="max-sim-secondary"
                disabled={batch.length === 0}
                onClick={() => setBatch([])}
              >
                Clear
              </button>
              <label className="max-sim-check">
                <input
                  type="checkbox"
                  checked={keepBatch}
                  onChange={(e) => setKeepBatch(e.target.checked)}
                />
                Keep after sending
              </label>
            </div>
          </div>

          <div className="max-sim-panel">
            <h2>Error cases</h2>
            <p className="max-sim-note">Each button sends one invalid frame right away.</p>
            <ul className="max-sim-presets">
              {errorPresets.map((preset) => (
                <li key={preset.name}>
                  <button
                    type="button"
                    className="max-sim-secondary"
                    disabled={!connected}
                    onClick={() => sendPreset(preset)}
                  >
                    {preset.name}
                  </button>
                  <span>
                    {preset.detail} Expects {preset.expects}.
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="max-sim-log-header">
        <h2>Sent frames ({frames.length})</h2>
        <button type="button" className="test-session-clear" onClick={() => setFrames([])}>
          Clear
        </button>
      </div>
      {frames.length === 0 ? (
        <p className="test-session-empty">
          Nothing sent yet. Each frame appears here with the ack the server returns.
        </p>
      ) : (
        <ul className="max-sim-log">
          {frames.map((frame) => (
            <li key={frame.key} className="max-sim-frame">
              <p className="test-session-meta">
                <strong>{frame.label}</strong> · sent {new Date(frame.sentAt).toLocaleTimeString()}
                {frame.ack && ` · ack after ${frame.ack.receivedAt - frame.sentAt} ms`}
              </p>
              <AckSummary frame={frame} />
              <details>
                <summary>Frame sent</summary>
                <pre>{pretty(frame.text)}</pre>
              </details>
              {frame.ack && (
                <details>
                  <summary>Ack received</summary>
                  <pre>{pretty(frame.ack.text)}</pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default MaxSimulator
