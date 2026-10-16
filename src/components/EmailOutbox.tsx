import { useState } from 'react'
import { api } from '../api'
import type { OutboxEmail, OutboxStatus } from '../types'

const STATUSES: OutboxStatus[] = ['queued', 'sending', 'sent', 'failed', 'cancelled']

function when(iso: string): string {
  return iso ? new Date(iso).toLocaleString() : ''
}

export function EmailOutbox({
  emails,
  dryRun,
  onChange,
}: {
  emails: OutboxEmail[]
  dryRun: boolean
  onChange: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const counts = Object.fromEntries(
    STATUSES.map((s) => [s, emails.filter((e) => e.status === s).length]),
  ) as Record<OutboxStatus, number>
  const now = new Date().toISOString()
  const due = emails.filter((e) => e.status === 'queued' && e.sendAfter <= now).length

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      onChange()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function sendNow() {
    if (!window.confirm(`Send ${due} queued email${due === 1 ? '' : 's'} now?`)) return
    run(async () => {
      const r = await api.dispatchEmails()
      setMessage(
        `Sent ${r.sent}` +
          (r.requeued ? `, ${r.requeued} will retry` : '') +
          (r.failed ? `, ${r.failed} failed` : '') +
          (r.remaining ? `, ${r.remaining} left for the next run` : '') +
          '.',
      )
    })
  }

  return (
    <section className="card page-card">
      <h2>
        Outbox
        {STATUSES.filter((s) => counts[s] > 0).map((s) => (
          <span key={s} className={`pill outbox-pill-${s}`}>
            {counts[s]} {s}
          </span>
        ))}
      </h2>
      {dryRun && (
        <p className="over">
          Dry-run mode: Gmail isn't configured, so emails are logged on the server, not sent.
        </p>
      )}
      <div className="email-compose-footer">
        <p className="muted">Queued emails stay here until you send them.</p>
        <button type="button" onClick={sendNow} disabled={busy || due === 0}>
          {busy ? 'Working…' : `Send queued now (${due})`}
        </button>
      </div>
      {message && <p className="muted">{message}</p>}
      {error && <div className="error">⚠️ {error}</div>}

      <ul className="list">
        {emails.map((e) => (
          <li key={e.id} className="row outbox-row">
            <div className="outbox-main">
              <span>
                <strong>{e.guestName}</strong> <span className="muted">· {e.to}</span>
              </span>
              <p className="muted email-subject">{e.subject}</p>
              <p className="muted email-subject">
                {e.status === 'sent'
                  ? `Sent ${when(e.sentAt)}`
                  : e.status === 'queued' && e.sendAfter > now
                    ? `Scheduled after ${when(e.sendAfter)}`
                    : `Staged ${when(e.createdAt)}`}
              </p>
              {e.error && <p className="over email-subject">{e.error}</p>}
            </div>
            <div className="task-row-actions">
              <span className={`pill outbox-pill-${e.status}`}>{e.status}</span>
              {e.status === 'queued' && (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => run(() => api.cancelEmail(e.id))}
                >
                  Cancel
                </button>
              )}
              {(e.status === 'failed' || e.status === 'sending' || e.status === 'cancelled') && (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => run(() => api.retryEmail(e.id))}
                >
                  Requeue
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {emails.length === 0 && <p className="muted">Nothing staged yet.</p>}
    </section>
  )
}
