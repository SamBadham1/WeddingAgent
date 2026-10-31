import { useCallback, useEffect, useState } from 'react'
import { EmailCompose } from '../components/EmailCompose'
import { EmailOutbox } from '../components/EmailOutbox'
import { EmailPreview } from '../components/EmailPreview'
import { api } from '../api'
import type { Guest, OutboxEmail } from '../types'

export function EmailsPage() {
  const [guests, setGuests] = useState<Guest[]>([])
  const [outbox, setOutbox] = useState<OutboxEmail[]>([])
  const [dryRun, setDryRun] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    Promise.all([api.getGuests(), api.getOutbox()])
      .then(([g, o]) => {
        setGuests(g)
        setOutbox(o.emails)
        setDryRun(o.dryRun)
        setError(null)
      })
      .catch((e) => setError((e as Error).message))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <div className="email-page">
      {error && <div className="error">⚠️ {error}</div>}
      <EmailPreview guests={guests} />
      <EmailCompose guests={guests} outbox={outbox} onStaged={refresh} />
      <EmailOutbox emails={outbox} dryRun={dryRun} onChange={refresh} />
    </div>
  )
}
