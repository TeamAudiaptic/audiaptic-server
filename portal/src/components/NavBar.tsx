import '../style/NavBar.css'

export type Page = 'upload' | 'media' | 'sessions'

type NavBarProps = {
  username: string
  page: Page
  onNavigate: (page: Page) => void
  onLogout: () => void
}

const links: { page: Page; label: string }[] = [
  { page: 'upload', label: 'Upload' },
  { page: 'media', label: 'Media' },
  { page: 'sessions', label: 'Manage Sessions' },
]

function NavBar({ username, page, onNavigate, onLogout }: NavBarProps) {
  return (
    <nav className="navbar">
      <div className="navbar-links">
        {links.map((link) => (
          <button
            key={link.page}
            type="button"
            className={`navbar-link${page === link.page ? ' active' : ''}`}
            onClick={() => onNavigate(link.page)}
          >
            {link.label}
          </button>
        ))}
      </div>

      <div className="navbar-user">
        <span>Signed in as <strong>{username}</strong></span>
        <button type="button" className="navbar-logout" onClick={onLogout}>
          Log out
        </button>
      </div>
    </nav>
  )
}

export default NavBar
