import { useEffect, useState } from 'react'
import { api } from '../api'
import type { BudgetItem, WeddingSummary } from '../types'
import { EditIcon } from './icons'

function parseAmount(value: string): number | null {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

function BudgetRow({
  item,
  onChange,
}: {
  item: BudgetItem
  onChange: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [category, setCategory] = useState(item.category)
  const [estimated, setEstimated] = useState(String(item.estimated))
  const [actual, setActual] = useState(String(item.actual))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setCategory(item.category)
    setEstimated(String(item.estimated))
    setActual(String(item.actual))
  }, [item])

  function startEdit() {
    setCategory(item.category)
    setEstimated(String(item.estimated))
    setActual(String(item.actual))
    setEditing(true)
  }

  function cancelEdit() {
    setCategory(item.category)
    setEstimated(String(item.estimated))
    setActual(String(item.actual))
    setEditing(false)
  }

  async function save() {
    const nextEstimated = parseAmount(estimated)
    const nextActual = parseAmount(actual)
    if (!category.trim() || nextEstimated === null || nextActual === null) return

    setSaving(true)
    try {
      await api.updateBudgetItem(item.id, {
        category: category.trim(),
        estimated: nextEstimated,
        actual: nextActual,
      })
      setEditing(false)
      onChange()
    } finally {
      setSaving(false)
    }
  }

  const over = item.actual > item.estimated

  if (!editing) {
    return (
      <li className="row budget-row">
        <span className="budget-view-category">{item.category}</span>
        <div className="budget-row-actions">
          <span className={over ? 'over' : 'muted'}>
            ${item.actual.toLocaleString()} / ${item.estimated.toLocaleString()}
          </span>
          <button
            type="button"
            className="icon-btn"
            aria-label={`Edit ${item.category}`}
            onClick={startEdit}
          >
            <EditIcon />
          </button>
        </div>
      </li>
    )
  }

  return (
    <li className="row budget-row budget-row-editing">
      <input
        className="budget-input budget-category"
        aria-label="Category"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        disabled={saving}
      />
      <div className="budget-amounts">
        <label className="budget-field">
          <span className="budget-label">Est.</span>
          <input
            className="budget-input budget-number"
            type="number"
            min={0}
            step={1}
            aria-label={`Estimated for ${item.category}`}
            value={estimated}
            onChange={(e) => setEstimated(e.target.value)}
            disabled={saving}
          />
        </label>
        <label className="budget-field">
          <span className="budget-label">Actual</span>
          <input
            className="budget-input budget-number"
            type="number"
            min={0}
            step={1}
            aria-label={`Actual for ${item.category}`}
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            disabled={saving}
          />
        </label>
      </div>
      <div className="budget-edit-actions">
        <button type="button" className="btn-secondary" onClick={cancelEdit} disabled={saving}>
          Cancel
        </button>
        <button type="button" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </li>
  )
}

export function BudgetSection({
  wedding,
  budget,
  onChange,
}: {
  wedding: WeddingSummary | null
  budget: BudgetItem[]
  onChange: () => void
}) {
  const [editingTotal, setEditingTotal] = useState(false)
  const [totalBudget, setTotalBudget] = useState('')
  const [savingTotal, setSavingTotal] = useState(false)
  const [category, setCategory] = useState('')
  const [estimated, setEstimated] = useState('')
  const [actual, setActual] = useState('')

  useEffect(() => {
    if (wedding) setTotalBudget(String(wedding.totalBudget))
  }, [wedding])

  if (!wedding) return <section className="card page-card">Loading…</section>

  const pct = Math.min(100, Math.round((wedding.spent / wedding.totalBudget) * 100))

  function cancelTotalEdit() {
    setTotalBudget(String(wedding!.totalBudget))
    setEditingTotal(false)
  }

  async function saveTotalBudget() {
    const next = parseAmount(totalBudget)
    if (next === null) return
    setSavingTotal(true)
    try {
      await api.updateTotalBudget(next)
      setEditingTotal(false)
      onChange()
    } catch {
      setTotalBudget(String(wedding!.totalBudget))
    } finally {
      setSavingTotal(false)
    }
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    const est = parseAmount(estimated)
    const act = parseAmount(actual || '0')
    if (!category.trim() || est === null || act === null) return

    await api.addBudgetItem(category.trim(), est, act)
    setCategory('')
    setEstimated('')
    setActual('')
    onChange()
  }

  return (
    <section className="card page-card">
      <h2>Budget</h2>
      <div className="budget-summary">
        <span>
          <strong>${wedding.spent.toLocaleString()}</strong> spent
        </span>
        <span className="muted">of</span>
        {editingTotal ? (
          <div className="budget-total-edit">
            <input
              className="budget-input budget-total"
              type="number"
              min={0}
              step={1}
              aria-label="Total budget"
              value={totalBudget}
              onChange={(e) => setTotalBudget(e.target.value)}
              disabled={savingTotal}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={cancelTotalEdit}
              disabled={savingTotal}
            >
              Cancel
            </button>
            <button type="button" onClick={saveTotalBudget} disabled={savingTotal}>
              {savingTotal ? 'Saving…' : 'Save'}
            </button>
          </div>
        ) : (
          <div className="budget-total-view">
            <strong>${wedding.totalBudget.toLocaleString()}</strong>
            <button
              type="button"
              className="icon-btn"
              aria-label="Edit total budget"
              onClick={() => setEditingTotal(true)}
            >
              <EditIcon />
            </button>
          </div>
        )}
        <span className="muted">· ${wedding.remaining.toLocaleString()} remaining</span>
      </div>
      <div className="bar">
        <div className="bar-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="budget-table-head">
        <span>Category</span>
        <span>Actual / Est.</span>
      </div>
      <ul className="list budget-list">
        {budget.map((b) => (
          <BudgetRow key={b.id} item={b} onChange={onChange} />
        ))}
      </ul>

      <form className="add-form budget-add-form" onSubmit={addItem}>
        <input
          aria-label="New category"
          placeholder="New category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
        <input
          aria-label="Estimated amount"
          type="number"
          min={0}
          step={1}
          placeholder="Estimated"
          value={estimated}
          onChange={(e) => setEstimated(e.target.value)}
        />
        <input
          aria-label="Actual amount"
          type="number"
          min={0}
          step={1}
          placeholder="Actual (optional)"
          value={actual}
          onChange={(e) => setActual(e.target.value)}
        />
        <button type="submit">Add item</button>
      </form>
    </section>
  )
}
