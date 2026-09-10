import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { api } from '../api'
import type { WeddingSummary } from '../types'
import { formatDate } from '../utils/formatDate'

export function AppLayout() {
  const [wedding, setWedding] = useState<WeddingSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .getWedding()
      .then(setWedding)
      .catch((e) => setError((e as Error).message))
  }, [])

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
      </nav>

      {error && <div className="error">⚠️ {error}</div>}

      <main className="page">
        <Outlet context={{ wedding }} />
      </main>
    </div>
  )
}
