import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type MouseEvent, type SubmitEvent } from 'react'
import '../style/Upload.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

// R2 has no real folders, so a folder is just a key prefix: "<folder>/<file name>"
function cleanFolderName(folder: string) {
  return folder.replace(/[\\/]+/g, ' ').trim()
}

// Sentinel for the "+ New folder" option in the folder dropdown
const NEW_FOLDER = '\0new'

// Existing folders are the key prefixes (before the last "/") of everything in the bucket
async function listFolders(): Promise<string[]> {
  const response = await fetch(`${API_URL}/api/r2/files`)
  if (!response.ok) throw new Error('Failed to load folders')

  const result: { files: { name: string }[] } = await response.json()
  const folders = new Set<string>()
  for (const { name } of result.files) {
    const slash = name.lastIndexOf('/')
    if (slash > 0) folders.add(name.slice(0, slash))
  }
  return [...folders].sort((a, b) => a.localeCompare(b))
}

async function uploadFile(file: File, folder: string): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_URL}/api/r2/upload`, {
    method: 'POST',
    headers: {
      'x-filename': folder ? `${folder}/${file.name}` : file.name,
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

function isAllowedType(file: File) {
  return /^(audio|image|video)\//.test(file.type)
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function Upload() {
  const [file, setFile] = useState<File | null>(null)
  const [folders, setFolders] = useState<string[]>([])
  const [folderChoice, setFolderChoice] = useState('')
  const [newFolder, setNewFolder] = useState('')
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const refreshFolders = () => {
    listFolders()
      .then(setFolders)
      .catch(() => {
        // The dropdown just falls back to "No session" and "+ New session"
      })
  }

  useEffect(() => {
    refreshFolders()
  }, [])

  const selectFile = (selected: File | undefined) => {
    if (selected && !isAllowedType(selected)) {
      setFile(null)
      setMessage('Only audio, image, and video files can be uploaded.')
      return
    }
    setFile(selected ?? null)
    setMessage('')
  }

  const removeFile = (e: MouseEvent<HTMLButtonElement>) => {
    // The button sits inside the drop zone's label, so don't let the click open the file picker
    e.preventDefault()
    // Clear the input too, otherwise re-selecting the same file wouldn't trigger onChange
    if (fileInputRef.current) fileInputRef.current.value = ''
    setFile(null)
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

    const folderName = folderChoice === NEW_FOLDER ? cleanFolderName(newFolder) : folderChoice

    setUploading(true)
    try {
      await uploadFile(file, folderName)
      // Clear the drop zone (and the input, so the same file can be picked again)
      if (fileInputRef.current) fileInputRef.current.value = ''
      setFile(null)
      setMessage(
        `"${file.name}" is ready. It has been uploaded to ${folderName ? `the "${folderName}" session` : 'storage without a session'}.`
      )
      // A newly created folder now exists, so pick it from the dropdown from here on
      setFolderChoice(folderName)
      setNewFolder('')
      refreshFolders()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <section className="upload">
      <form className="upload-card" onSubmit={handleSubmit}>
        <h1>Upload a file</h1>

        <label className="upload-folder">
          <span>Session</span>
          <select
            value={folderChoice}
            onChange={(e) => setFolderChoice(e.target.value)}
            disabled={uploading}
          >
            <option value="">No session</option>
            {folders.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            <option value={NEW_FOLDER}>+ New session...</option>
          </select>
          {folderChoice === NEW_FOLDER && (
            <input
              type="text"
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value)}
              placeholder="New session name, e.g. concert-1"
              disabled={uploading}
              autoFocus
            />
          )}
        </label>

        <label
          className={`upload-drop${dragging ? ' dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,image/*,video/*"
            onChange={handleChange}
          />
          {file ? (
            <span className="upload-file">
              <span>
                <strong>{file.name}</strong> ({formatSize(file.size)})
              </span>
              <button
                type="button"
                className="upload-remove"
                onClick={removeFile}
                disabled={uploading}
                aria-label={`Remove ${file.name}`}
              >
                Remove
              </button>
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
