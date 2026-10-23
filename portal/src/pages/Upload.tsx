import { useState, type ChangeEvent, type DragEvent, type SubmitEvent } from 'react'
import '../style/Upload.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

async function uploadFile(file: File): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_URL}/api/r2/upload`, {
    method: 'POST',
    headers: {
      'x-filename': file.name,
      'content-type': file.type || 'application/octet-stream',
    },
    body: file,
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(result.error || 'Upload failed')
  }

  return {
    success: true,
    message: result.message,
  }
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function Upload() {
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')

  const selectFile = (selected: File | undefined) => {
    setFile(selected ?? null)
    setMessage('')
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    selectFile(e.target.files?.[0])
  }

  const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    setDragging(false)
    selectFile(e.dataTransfer.files[0])
  }

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!file) return

    setUploading(true)
    await uploadFile(file)
    setUploading(false)
    setMessage(`"${file.name}" is ready. It has been uploaded to the session storage.`)
  }

  return (
    <section className="upload">
      <form className="upload-card" onSubmit={handleSubmit}>
        <h1>Upload a file</h1>

        <label
          className={`upload-drop${dragging ? ' dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <input type="file" onChange={handleChange} />
          {file ? (
            <span>
              <strong>{file.name}</strong> ({formatSize(file.size)})
            </span>
          ) : (
            <span>Drag a file here or click to choose one</span>
          )}
        </label>

        {message && <p className="upload-message">{message}</p>}

        <button type="submit" className="upload-button" disabled={!file || uploading}>
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
      </form>
    </section>
  )
}

export default Upload
