import { useState } from 'react'
import NavBar, { type Page } from './components/NavBar.tsx'
import Login from './pages/Login.tsx'
import ManageSessions from './pages/ManageSessions.tsx'
import Media from './pages/Media.tsx'
import Upload from './pages/Upload.tsx'

function App() {
  const [user, setUser] = useState<string | null>(null)
  const [page, setPage] = useState<Page>('upload')

  if (!user) {
    return <Login onLogin={setUser} />
  }

  const handleLogout = () => {
    setUser(null)
    setPage('upload')
  }

  return (
    <>
      <NavBar
        username={user}
        page={page}
        onNavigate={setPage}
        onLogout={handleLogout}
      />
      {page === 'upload' && <Upload />}
      {page === 'media' && <Media />}
      {page === 'sessions' && <ManageSessions />}
    </>
  )
}

export default App
