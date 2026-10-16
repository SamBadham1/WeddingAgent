import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { ADMIN_TOKEN_REQUIRED_EVENT, api, setAdminToken } from '../api'
import type { WeddingSummary } from '../types'
import { formatDate } from '../utils/formatDate'

export function AppLayout() {
  const [wedding, setWedding] = useState<WeddingSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [needsToken, setNeedsToken] = useState(false)
  const [tokenInput, setTokenInput] = useState('')

  useEffect(() => {
    const onTokenRequired = () => setNeedsToken(true)
    window.addEventListener(ADMIN_TOKEN_REQUIRED_EVENT, onTokenRequired)
    api
      .getWedding()
      .then(setWedding)
      .catch((e) => setError((e as Error).message))
    return () => window.removeEventListener(ADMIN_TOKEN_REQUIRED_EVENT, onTokenRequired)
  }, [])

  function saveToken(e: React.FormEvent) {
    e.preventDefault()
    if (!tokenInput.trim()) return
    setAdminToken(tokenInput.trim())
    window.location.reload()
  }

  if (needsToken) {
    return (
      <div className="app">
        <header className="hero">
          <h1>💍 WeddingAgent</h1>
        </header>
        <form className="card token-card" onSubmit={saveToken}>
          <h2>Admin password</h2>
          <p className="muted">Enter the dashboard password to continue.</p>
          <div className="add-form">
            <input
              type="password"
              aria-label="Admin password"
              placeholder="Password"
              autoFocus
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
            />
            <button type="submit">Unlock</button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="hero">
        <h1>💍 WeddingAgent</h1>
        {wedding && (
          <p className="subtitle">
            Planning <strong>{wedding.coupleNames}</strong> · {formatDate(wedding.date)}
          </p>
        )}
      </header>

      <nav className="nav">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          Home
        </NavLink>
        <NavLink to="/budget" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          Budget
        </NavLink>
        <NavLink to="/guests" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          Guests
        </NavLink>
        <NavLink to="/tasks" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          Tasks
        </NavLink>
        <NavLink to="/emails" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          Emails
        </NavLink>
      </nav>

      {error && <div className="error">⚠️ {error}</div>}

      <main className="page">
        <Outlet context={{ wedding }} />
      </main>
    </div>
  )
}
