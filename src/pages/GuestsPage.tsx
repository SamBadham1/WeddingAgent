import { useCallback, useEffect, useState } from 'react'
import { GuestSection } from '../components/GuestSection'
import { api } from '../api'
import type { Guest } from '../types'

export function GuestsPage() {
  const [guests, setGuests] = useState<Guest[]>([])
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    api
      .getGuests()
      .then((g) => {
        setGuests(g)
        setError(null)
      })
      .catch((e) => setError((e as Error).message))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  if (error) return <div className="error">⚠️ {error}</div>

  return <GuestSection guests={guests} onChange={refresh} />
}
