import { useCallback, useEffect, useState } from 'react'
import { BudgetSection } from '../components/BudgetSection'
import { api } from '../api'
import type { BudgetItem, WeddingSummary } from '../types'

export function BudgetPage() {
  const [wedding, setWedding] = useState<WeddingSummary | null>(null)
  const [budget, setBudget] = useState<BudgetItem[]>([])
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    Promise.all([api.getWedding(), api.getBudget()])
      .then(([w, b]) => {
        setWedding(w)
        setBudget(b)
        setError(null)
      })
      .catch((e) => setError((e as Error).message))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  if (error) return <div className="error">⚠️ {error}</div>

  return <BudgetSection wedding={wedding} budget={budget} onChange={refresh} />
}
