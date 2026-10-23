import { useEffect, useState } from 'react'
import '../style/Media.css'

type MediaItem = {
  name: string
  url: string
  type: string
  size: number
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'
const R2_BUCKET_URL = import.meta.env.VITE_R2_BUCKET_URL || ''

function getContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()

  const typeMap: Record<string, string> = {
    // Images
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',

    // Videos
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',

    // Audio
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    flac: 'audio/flac',
  }

  return typeMap[ext || ''] || 'application/octet-stream'
}

async function listMedia(): Promise<MediaItem[]> {
  const response = await fetch(`${API_URL}/api/r2/files`)

  if (!response.ok) {
    throw new Error('Failed to load media')
  }

  const result = await response.json()

  // Map the R2 response to MediaItem format
  return result.files.map(
    (file: { name: string; size: number }) => ({
      name: file.name,
      url: `${R2_BUCKET_URL}/${file.name}`,
      type: getContentType(file.name),
      size: file.size,
    })
  )
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function Preview({ item }: { item: MediaItem }) {
  if (item.type.startsWith('image/')) {
    return <img src={item.url} alt={item.name} />
  }
  if (item.type.startsWith('video/')) {
    return <video src={item.url} controls />
  }
  if (item.type.startsWith('audio/')) {
    return <audio src={item.url} controls />
  }
  return <div className="media-file-icon">File</div>
}

function Media() {
  const [items, setItems] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    listMedia()
      .then((media) => {
        setItems(media)
        setLoading(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load media')
        setLoading(false)
      })
  }, [])

  return (
    <section className="media">
      <h1>Media</h1>

      {loading ? (
        <p className="media-empty">Loading...</p>
      ) : error ? (
        <p className="media-empty">✗ {error}</p>
      ) : items.length === 0 ? (
        <p className="media-empty">No media uploaded yet.</p>
      ) : (
        <ul className="media-grid">
          {items.map((item) => (
            <li key={item.url} className="media-card">
              <div className="media-preview">
                <Preview item={item} />
              </div>
              <div className="media-info">
                <strong>{item.name}</strong>
                <span>{formatSize(item.size)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default Media