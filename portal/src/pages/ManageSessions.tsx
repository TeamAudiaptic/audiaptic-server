import { useState, type SubmitEvent } from 'react'
import Modal from '../components/Modal.tsx'
import savedSessions from '../../data/sessions.json'
import '../style/ManageSessions.css'

type Session = {
  id: string
  performanceName: string
  description: string
  performers: string[]
  createdAt: string
}

// TODO: replace with a real save once storage is connected
async function saveSession(session: Session): Promise<void> {
  console.log('Session saving not connected yet:', session)
}

// TODO: replace with a real delete once storage is connected
async function deleteSession(id: string): Promise<void> {
  console.log('Session deleting not connected yet:', id)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString()
}

function NewSessionForm({
  onCreate,
  onCancel,
}: {
  onCreate: (session: Session) => void
  onCancel: () => void
}) {
  const [performanceName, setPerformanceName] = useState('')
  const [description, setDescription] = useState('')
  const [performers, setPerformers] = useState<string[]>([''])

  const updatePerformer = (index: number, value: string) => {
    setPerformers(performers.map((p, i) => (i === index ? value : p)))
  }

  const removePerformer = (index: number) => {
    setPerformers(performers.filter((_, i) => i !== index))
  }

  const handleSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    onCreate({
      id: crypto.randomUUID(),
      performanceName: performanceName.trim(),
      description: description.trim(),
      performers: performers.map((p) => p.trim()).filter(Boolean),
      createdAt: new Date().toISOString(),
    })
  }

  return (
    <form className="session-form" onSubmit={handleSubmit}>
      <div className="session-field">
        <label htmlFor="performanceName">Performance name</label>
        <input
          id="performanceName"
          type="text"
          value={performanceName}
          onChange={(e) => setPerformanceName(e.target.value)}
          required
        />
      </div>

      <div className="session-field">
        <label htmlFor="description">Description</label>
        <textarea
          id="description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="session-field">
        <label htmlFor="performer-0">Performers</label>
        {performers.map((performer, index) => (
          <div key={index} className="session-performer">
            <input
              id={`performer-${index}`}
              type="text"
              placeholder={`Performer ${index + 1}`}
              value={performer}
              onChange={(e) => updatePerformer(index, e.target.value)}
              required={index === 0}
            />
            {performers.length > 1 && (
              <button
                type="button"
                className="session-remove"
                aria-label={`Remove performer ${index + 1}`}
                onClick={() => removePerformer(index)}
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          className="session-add"
          onClick={() => setPerformers([...performers, ''])}
        >
          + Add performer
        </button>
      </div>

      <div className="session-actions">
        <button type="button" className="session-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="session-primary">
          Create session
        </button>
      </div>
    </form>
  )
}

function SessionDetails({
  session,
  onEnd,
  onClose,
}: {
  session: Session
  onEnd: (session: Session) => void
  onClose: () => void
}) {
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="session-details">
      <dl>
        <dt>Created</dt>
        <dd>{formatDate(session.createdAt)}</dd>
        <dt>Description</dt>
        <dd>{session.description || 'No description'}</dd>
        <dt>Performers</dt>
        <dd>
          <ul>
            {session.performers.map((performer, index) => (
              <li key={index}>{performer}</li>
            ))}
          </ul>
        </dd>
      </dl>

      {confirming ? (
        <div className="session-confirm">
          <p>End this session? It will be permanently deleted.</p>
          <div className="session-actions">
            <button
              type="button"
              className="session-secondary"
              onClick={() => setConfirming(false)}
            >
              Keep session
            </button>
            <button
              type="button"
              className="session-danger"
              onClick={() => onEnd(session)}
            >
              Yes, end and delete
            </button>
          </div>
        </div>
      ) : (
        <div className="session-actions">
          <button type="button" className="session-secondary" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="session-danger"
            onClick={() => setConfirming(true)}
          >
            End session
          </button>
        </div>
      )}
    </div>
  )
}

function ManageSessions() {
  const [sessions, setSessions] = useState<Session[]>(savedSessions)
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<Session | null>(null)

  const handleCreate = async (session: Session) => {
    await saveSession(session)
    setSessions([session, ...sessions])
    setCreating(false)
  }

  const handleEnd = async (session: Session) => {
    await deleteSession(session.id)
    setSessions(sessions.filter((s) => s.id !== session.id))
    setSelected(null)
  }

  return (
    <section className="sessions">
      <div className="sessions-header">
        <h1>Manage Sessions</h1>
        <button
          type="button"
          className="session-primary"
          onClick={() => setCreating(true)}
        >
          + New session
        </button>
      </div>

      <h2>Previous sessions</h2>

      {sessions.length === 0 ? (
        <p className="sessions-empty">No sessions yet. Create one to get started.</p>
      ) : (
        <ul className="sessions-list">
          {sessions.map((session) => (
            <li key={session.id}>
              <button
                type="button"
                className="session-card"
                onClick={() => setSelected(session)}
              >
                <div className="session-card-top">
                  <strong>{session.performanceName}</strong>
                  <span className="session-date">{formatDate(session.createdAt)}</span>
                </div>
                {session.description && <p>{session.description}</p>}
                <p className="session-performers">
                  Performers: {session.performers.join(', ')}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {creating && (
        <Modal title="New session" onClose={() => setCreating(false)}>
          <NewSessionForm
            onCreate={handleCreate}
            onCancel={() => setCreating(false)}
          />
        </Modal>
      )}

      {selected && (
        <Modal title={selected.performanceName} onClose={() => setSelected(null)}>
          <SessionDetails
            session={selected}
            onEnd={handleEnd}
            onClose={() => setSelected(null)}
          />
        </Modal>
      )}
    </section>
  )
}

export default ManageSessions
