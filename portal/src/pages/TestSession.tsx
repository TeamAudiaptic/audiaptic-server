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
  execTimestamp?: number
  text: string
}

function parseEvent(key: number, data: string): ReceivedEvent {
  const receivedAt = Date.now()
  try {
    const event = JSON.parse(data)
    return {
      key,
      receivedAt,
      type: event.type ?? 'unknown',
      execTimestamp: typeof event.execTimestamp === 'number' ? event.execTimestamp : undefined,
      text: JSON.stringify(event, null, 2),
    }
  } catch {
    return { key, receivedAt, type: 'not JSON', text: data }
  }
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

    const connect = () => {
      socket = new WebSocket(AUDIENCE_URL)
      socket.onopen = () => setConnected(true)
      socket.onmessage = (message) => {
        const received = parseEvent(nextKey++, message.data)
        setEvents((current) => [received, ...current])
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
                {event.execTimestamp !== undefined &&
                  ` · executes in ${event.execTimestamp - event.receivedAt} ms`}
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
