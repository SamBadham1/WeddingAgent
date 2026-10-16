import { useCallback, useEffect, useState } from 'react'
import { EmailCompose } from '../components/EmailCompose'
import { EmailOutbox } from '../components/EmailOutbox'
import { EmailTemplates } from '../components/EmailTemplates'
import { api } from '../api'
import type { EmailTemplate, Guest, OutboxEmail } from '../types'

export function EmailsPage() {
  const [guests, setGuests] = useState<Guest[]>([])
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [outbox, setOutbox] = useState<OutboxEmail[]>([])
  const [dryRun, setDryRun] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    Promise.all([api.getGuests(), api.getEmailTemplates(), api.getOutbox()])
      .then(([g, t, o]) => {
        setGuests(g)
        setTemplates(t)
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
      <EmailTemplates templates={templates} guests={guests} onChange={refresh} />
      <EmailCompose templates={templates} guests={guests} outbox={outbox} onStaged={refresh} />
      <EmailOutbox emails={outbox} dryRun={dryRun} onChange={refresh} />
    </div>
  )
}
