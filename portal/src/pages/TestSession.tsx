import { useEffect, useState } from 'react'
import MaxSimulator from '../components/MaxSimulator.tsx'
import '../style/TestSession.css'

// Defaults to the host the portal was opened from, so a phone on the same network
// reaches the API on this machine instead of its own localhost
const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3000`
const SOCKET_URL = API_URL.replace(/^http/, 'ws')
// 'davhi' stands in for a performance join code until joining with a code is implemented
const AUDIENCE_URL = `${SOCKET_URL}/api/audience/davhi`
const PERFORMER_URL = `${SOCKET_URL}/api/performer`

const RECONNECT_DELAY_MS = 2000

type Tab = 'audience' | 'max'

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

// The audience tab acts as an audience device: it connects to the audience socket and lists every
// event it receives. The Max tab acts as Max and sends events to the performer socket.
function TestSession() {
  const [tab, setTab] = useState<Tab>('audience')
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
        <div className="test-session-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'audience'}
            className={`test-session-tab${tab === 'audience' ? ' active' : ''}`}
            onClick={() => setTab('audience')}
          >
            Audience view ({events.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'max'}
            className={`test-session-tab${tab === 'max' ? ' active' : ''}`}
            onClick={() => setTab('max')}
          >
            Max simulator
          </button>
        </div>
      </div>

      {/* Both panels stay mounted, so each keeps its socket and its lists while the other shows */}
      <div role="tabpanel" hidden={tab !== 'audience'}>
        <div className="test-session-bar">
          <div>
            <p className={`test-session-status${connected ? ' connected' : ''}`}>
              {connected ? 'Connected' : 'Disconnected, retrying...'}
            </p>
            <p className="test-session-meta">
              {AUDIENCE_URL} · {events.length} events
            </p>
          </div>
          <button type="button" className="test-session-clear" onClick={() => setEvents([])}>
            Clear
          </button>
        </div>

        {events.length === 0 ? (
          <p className="test-session-empty">
            No events yet. Events sent from Max or the Max simulator tab will appear here.
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
      </div>

      <div role="tabpanel" hidden={tab !== 'max'}>
        <MaxSimulator url={PERFORMER_URL} />
      </div>
    </section>
  )
}

export default TestSession
