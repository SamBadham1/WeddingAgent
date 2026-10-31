import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import type { Guest, OutboxEmail, StageResult } from '../types'

type Filter = 'all' | 'pending' | `group:${string}`

function matches(guest: Guest, filter: Filter): boolean {
  if (!guest.email) return false
  if (filter === 'all') return true
  if (filter === 'pending') return guest.rsvp === 'pending'
  return guest.group === filter.slice('group:'.length)
}

export function EmailCompose({
  guests,
  outbox,
  onStaged,
}: {
  guests: Guest[]
  outbox: OutboxEmail[]
  onStaged: () => void
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [sendAfter, setSendAfter] = useState('')
  const [skipAlreadySent, setSkipAlreadySent] = useState(true)
  const [staging, setStaging] = useState(false)
  const [result, setResult] = useState<StageResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const groups = useMemo(() => [...new Set(guests.map((g) => g.group))].sort(), [guests])

  // Guests with any email queued or sent, including invites from the old templates
  const alreadyHas = useMemo(
    () =>
      new Set(
        outbox.filter((e) => ['queued', 'sending', 'sent'].includes(e.status)).map((e) => e.guestId),
      ),
    [outbox],
  )

  useEffect(() => {
    setSelected(new Set(guests.filter((g) => matches(g, filter)).map((g) => g.id)))
  }, [guests, filter])

  function toggle(id: number) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  async function stage() {
    setStaging(true)
    setError(null)
    setResult(null)
    try {
      const res = await api.stageEmails([...selected], {
        sendAfter: sendAfter ? new Date(sendAfter).toISOString() : undefined,
        skipAlreadySent,
      })
      setResult(res)
      onStaged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setStaging(false)
    }
  }

  return (
    <section className="card page-card">
      <h2>Stage invites</h2>
      <div className="add-form email-compose-controls">
        <select
          className="budget-input"
          aria-label="Recipients"
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
        >
          <option value="all">Everyone with an email</option>
          <option value="pending">RSVP pending</option>
          {groups.map((g) => (
            <option key={g} value={`group:${g}`}>
              Group: {g}
            </option>
          ))}
        </select>
        <label className="muted email-send-after">
          Send after
          <input
            className="budget-input"
            type="datetime-local"
            value={sendAfter}
            onChange={(e) => setSendAfter(e.target.value)}
          />
        </label>
      </div>

      <ul className="list email-guest-list">
        {guests.map((g) => (
          <li key={g.id} className="row">
            <label className="check">
              <input
                type="checkbox"
                checked={selected.has(g.id)}
                disabled={!g.email}
                onChange={() => toggle(g.id)}
              />
              <span>
                {g.name} <span className="muted">· {g.email || 'no email'}</span>
              </span>
            </label>
            <span className="email-guest-pills">
              {alreadyHas.has(g.id) && <span className="pill">Invited</span>}
              <span className={`pill rsvp-pill-${g.rsvp}`}>{g.rsvp}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="email-compose-footer">
        <label className="check">
          <input
            type="checkbox"
            checked={skipAlreadySent}
            onChange={(e) => setSkipAlreadySent(e.target.checked)}
          />
          Skip guests who already have an invite
        </label>
        <button type="button" onClick={stage} disabled={staging || selected.size === 0}>
          {staging ? 'Staging…' : `Stage ${selected.size} invite${selected.size === 1 ? '' : 's'}`}
        </button>
      </div>

      {error && <div className="error">⚠️ {error}</div>}
      {result && (
        <p className="muted">
          Staged {result.staged}. Use “Send queued now” below when you're ready to send.
          {result.skipped.length > 0 && (
            <> Skipped: {result.skipped.map((s) => `${s.name} (${s.reason})`).join(', ')}.</>
          )}
        </p>
      )}
    </section>
  )
}
