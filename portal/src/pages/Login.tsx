import { useState, type SubmitEvent } from 'react'
import userInfo from '../../data/userinfo.json'
import '../style/Login.css'

type LoginProps = {
  onLogin: (username: string) => void
}

function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (username === userInfo.username && password === userInfo.password) {
      setError('')
      onLogin(username)
    } else {
      setError('Invalid username or password')
    }
  }

  return (
    <section className="login">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Login</h1>

        <div className="login-field">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>

        <div className="login-field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && <p className="login-error">{error}</p>}

        <button type="submit" className="login-button">
          Sign in
        </button>
      </form>
    </section>
  )
}

export default Login
