import { Link, useOutletContext } from 'react-router-dom'
import { AgentSection } from '../components/AgentSection'
import { WeddingCountdown } from '../components/WeddingCountdown'
import type { WeddingSummary } from '../types'

export function HomePage() {
  const { wedding } = useOutletContext<{ wedding: WeddingSummary | null }>()

  return (
    <div className="home">
      {wedding ? (
        <WeddingCountdown date={wedding.date} />
      ) : (
        <section className="card countdown">Loading countdown…</section>
      )}
      <div className="quick-links">
        <Link to="/budget" className="quick-link card">
          <span className="quick-link-title">Budget</span>
          <span className="muted">Track spending and estimates</span>
        </Link>
        <Link to="/guests" className="quick-link card">
          <span className="quick-link-title">Guests</span>
          <span className="muted">Manage RSVPs and groups</span>
        </Link>
        <Link to="/tasks" className="quick-link card">
          <span className="quick-link-title">Tasks</span>
          <span className="muted">Planning checklist</span>
        </Link>
      </div>
      <AgentSection />
    </div>
  )
}
