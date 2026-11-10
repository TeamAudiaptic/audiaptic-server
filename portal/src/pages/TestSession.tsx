import { useEffect, useState } from 'react'
import '../style/TestSession.css'

// Defaults to the host the portal was opened from, so a phone on the same network
// reaches the API on this machine instead of its own localhost
const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3000`
// 'davhi' stands in for a performance join code until joining with a code is implemented
const AUDIENCE_URL = `${API_URL.replace(/^http/, 'ws')}/api/audience/davhi`

const RECONNECT_DELAY_MS = 2000

type ReceivedEvent = {
  key: number
  receivedAt: number
  type: string
  // When the event should run, as the event docs' timing rules resolve it
  timing: string
  text: string
}

type Timeline = {
  // Execution time of the performance's start event, the anchor for relativeTimestamp
  startAt?: number
}

const isPositive = (value: unknown): value is number => typeof value === 'number' && value > 0

// A future epochTimestamp wins; otherwise a relativeTimestamp counts from the start event's
// execution time; with neither, the event runs immediately
function executeAt(event: any, receivedAt: number, timeline: Timeline): number | string {
  if (isPositive(event?.epochTimestamp) && event.epochTimestamp > receivedAt) {
    return event.epochTimestamp
  }
  if (isPositive(event?.relativeTimestamp)) {
    return timeline.startAt === undefined
      ? `relative +${event.relativeTimestamp} ms, but no start event has been received`
      : timeline.startAt + event.relativeTimestamp
  }
  return receivedAt
}

function describeTiming(event: any, receivedAt: number, timeline: Timeline): string {
  const at = executeAt(event, receivedAt, timeline)
  if (typeof at === 'string') {
    return at
  }
  if (event?.type === 'start') {
    if (timeline.startAt !== undefined) {
      return 'second start event; only one is supported, so the timeline anchor is unchanged'
    }
    timeline.startAt = at
  }
  const delay = at - receivedAt
  return delay > 0 ? `executes in ${delay} ms` : 'executes immediately'
}

// The server sends a single event, or a list of them when the performer sent a list
function parseEvents(nextKey: () => number, data: string, timeline: Timeline): ReceivedEvent[] {
  const receivedAt = Date.now()
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return [{ key: nextKey(), receivedAt, type: 'not JSON', timing: '', text: data }]
  }
  const list = Array.isArray(parsed) ? parsed : [parsed]
  return list.map((event) => ({
    key: nextKey(),
    receivedAt,
    type: event?.type ?? 'unknown',
    timing: describeTiming(event, receivedAt, timeline),
    text: JSON.stringify(event, null, 2),
  }))
}

// Acts as an audience device: connects to the audience socket and lists every event it receives
function TestSession() {
  const [connected, setConnected] = useState(false)
  const [events, setEvents] = useState<ReceivedEvent[]>([])

  useEffect(() => {
    let socket: WebSocket
    let retry: ReturnType<typeof setTimeout>
    let stopped = false
    let nextKey = 0
    // Kept across reconnects: the server doesn't replay the start event
    const timeline: Timeline = {}

    const connect = () => {
      socket = new WebSocket(AUDIENCE_URL)
      socket.onopen = () => setConnected(true)
      socket.onmessage = (message) => {
        // Newest first, so reverse the list to keep its last event on top
        const received = parseEvents(() => nextKey++, message.data, timeline).reverse()
        setEvents((current) => [...received, ...current])
      }
      // Reconnect so the page survives API restarts while testing
      socket.onclose = () => {
        setConnected(false)
        if (!stopped) {
          retry = setTimeout(connect, RECONNECT_DELAY_MS)
        }
      }
    }
    connect()

    return () => {
      stopped = true
      clearTimeout(retry)
      socket.close()
    }
  }, [])

  return (
    <section className="test-session">
      <div className="test-session-header">
        <h1>Test Session</h1>
        <button
          type="button"
          className="test-session-clear"
          onClick={() => setEvents([])}
        >
          Clear
        </button>
      </div>

      <p className={`test-session-status${connected ? ' connected' : ''}`}>
        {connected ? 'Connected' : 'Disconnected, retrying...'}
      </p>
      <p className="test-session-meta">
        {AUDIENCE_URL} · {events.length} events
      </p>

      {events.length === 0 ? (
        <p className="test-session-empty">
          No events yet. Events sent from Max will appear here.
        </p>
      ) : (
        <ul className="test-session-list">
          {events.map((event) => (
            <li key={event.key} className="test-session-event">
              <p className="test-session-meta">
                <strong>{event.type}</strong> · received{' '}
                {new Date(event.receivedAt).toLocaleTimeString()} · {event.receivedAt}
                {event.timing && ` · ${event.timing}`}
              </p>
              <pre>{event.text}</pre>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default TestSession
