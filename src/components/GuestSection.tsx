import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Guest } from '../types'
import { EditIcon } from './icons'

function GuestRow({
  guest,
  onChange,
}: {
  guest: Guest
  onChange: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [group, setGroup] = useState(guest.group)
  const [email, setEmail] = useState(guest.email)
  const [overnight, setOvernight] = useState(guest.overnight)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setGroup(guest.group)
    setEmail(guest.email)
    setOvernight(guest.overnight)
  }, [guest])

  function startEdit() {
    setGroup(guest.group)
    setEmail(guest.email)
    setOvernight(guest.overnight)
    setEditing(true)
  }

  function cancelEdit() {
    setGroup(guest.group)
    setEmail(guest.email)
    setOvernight(guest.overnight)
    setEditing(false)
  }

  async function save() {
    setSaving(true)
    try {
      await api.updateGuest(guest.id, {
        group: group.trim() || 'Other',
        email: email.trim(),
        overnight,
      })
      setEditing(false)
      onChange()
    } finally {
      setSaving(false)
    }
  }

  async function cycleRsvp() {
    const next: Guest['rsvp'] =
      guest.rsvp === 'pending' ? 'yes' : guest.rsvp === 'yes' ? 'no' : 'pending'
    await api.setRsvp(guest.id, next)
    onChange()
  }

  if (editing) {
    return (
      <li className="guest-row guest-row-editing">
        <p className="guest-name">{guest.name}</p>
        <div className="guest-edit-fields">
          <input
            className="budget-input"
            aria-label="Group"
            placeholder="Group"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            disabled={saving}
          />
          <input
            className="budget-input"
            type="email"
            aria-label="Email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={saving}
          />
          <label className="guest-overnight-check">
            <input
              type="checkbox"
              checked={overnight}
              onChange={(e) => setOvernight(e.target.checked)}
              disabled={saving}
            />
            Staying overnight
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

  return (
    <li className="guest-row">
      <div className="guest-main">
        <div className="guest-title-row">
          <span className="guest-name">{guest.name}</span>
          <span className="muted">· {guest.group}</span>
          {guest.overnight && <span className="pill">Overnight</span>}
        </div>
        {guest.email ? <p className="guest-email muted">{guest.email}</p> : null}
      </div>
      <div className="guest-row-actions">
        <button className={`rsvp rsvp-${guest.rsvp}`} onClick={cycleRsvp}>
          {guest.rsvp}
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={`Edit ${guest.name}`}
          onClick={startEdit}
        >
          <EditIcon />
        </button>
      </div>
    </li>
  )
}

export function GuestSection({
  guests,
  onChange,
}: {
  guests: Guest[]
  onChange: () => void
}) {
  const [name, setName] = useState('')
  const [group, setGroup] = useState('')
  const [email, setEmail] = useState('')
  const [overnight, setOvernight] = useState(false)
  const confirmed = guests.filter((g) => g.rsvp === 'yes').length
  const stayingOver = guests.filter((g) => g.overnight).length

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await api.addGuest(name, group, email, overnight)
    setName('')
    setGroup('')
    setEmail('')
    setOvernight(false)
    onChange()
  }

  return (
    <section className="card page-card">
      <h2>
        Guests{' '}
        <span className="pill">
          {confirmed}/{guests.length} confirmed · {stayingOver} overnight
        </span>
      </h2>
      <form className="add-form guest-add-form" onSubmit={add}>
        <input
          aria-label="Guest name"
          placeholder="Guest name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          aria-label="Guest group"
          placeholder="Group (optional)"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
        />
        <input
          aria-label="Guest email"
          type="email"
          placeholder="Email (optional)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label className="guest-overnight-check">
          <input
            type="checkbox"
            checked={overnight}
            onChange={(e) => setOvernight(e.target.checked)}
          />
          Overnight
        </label>
        <button type="submit">Add</button>
      </form>
      <ul className="list guest-list">
        {guests.map((g) => (
          <GuestRow key={g.id} guest={g} onChange={onChange} />
        ))}
      </ul>
    </section>
  )
}
