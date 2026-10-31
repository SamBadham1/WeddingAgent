import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Guest, RenderedEmail } from '../types'

// The invite is fixed (server/email/render.ts); this shows it as a chosen guest will receive it
export function EmailPreview({ guests }: { guests: Guest[] }) {
  const [guestId, setGuestId] = useState<number | ''>('')
  const [preview, setPreview] = useState<RenderedEmail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .previewEmail(guestId === '' ? undefined : guestId)
      .then((p) => {
        setPreview(p)
        setError(null)
      })
      .catch((e) => setError((e as Error).message))
  }, [guestId])

  return (
    <section className="card page-card">
      <h2>Invite email</h2>
      <div className="email-preview">
        <label className="muted">
          Preview for{' '}
          <select
            className="budget-input"
            value={guestId}
            onChange={(e) => setGuestId(e.target.value === '' ? '' : Number(e.target.value))}
          >
            <option value="">Sample guest</option>
            {guests.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        {error && <div className="error">⚠️ {error}</div>}
        <p className="email-preview-subject">{preview?.subject || '—'}</p>
        <iframe title="Email preview" sandbox="" className="email-preview-frame" srcDoc={preview?.html ?? ''} />
      </div>
    </section>
  )
}
