import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import type { Guest } from '../types'
import { EditIcon, LinkIcon, TrashIcon } from './icons'
import { GuestImport } from './GuestImport'

const PAGE_SIZES = [10, 25, 50, 100]

type RsvpFilter = 'all' | Guest['rsvp']
type OvernightFilter = 'all' | 'yes' | 'no'
type EmailFilter = 'all' | 'has' | 'none' | 'emailed' | 'not-emailed'

interface Filters {
  search: string
  rsvp: RsvpFilter
  overnight: OvernightFilter
  email: EmailFilter
}

const NO_FILTERS: Filters = { search: '', rsvp: 'all', overnight: 'all', email: 'all' }

function matches(guest: Guest, f: Filters): boolean {
  const q = f.search.trim().toLowerCase()
  if (q && ![guest.name, guest.email, guest.group, guest.rsvpMessage].some((v) => v.toLowerCase().includes(q))) {
    return false
  }
  if (f.rsvp !== 'all' && guest.rsvp !== f.rsvp) return false
  if (f.overnight !== 'all' && guest.overnight !== (f.overnight === 'yes')) return false
  if (f.email === 'has' && !guest.email) return false
  if (f.email === 'none' && guest.email) return false
  if (f.email === 'emailed' && !guest.lastEmailedAt) return false
  if (f.email === 'not-emailed' && (!guest.email || guest.lastEmailedAt)) return false
  return true
}

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
  const [copied, setCopied] = useState(false)
  const [removing, setRemoving] = useState(false)

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

  async function copyInviteLink() {
    await navigator.clipboard.writeText(guest.inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function remove() {
    if (!window.confirm(`Delete ${guest.name}? Their RSVP and invite link stop working, and any queued email to them is cancelled.`)) return
    setRemoving(true)
    try {
      await api.deleteGuest(guest.id)
      onChange()
    } finally {
      setRemoving(false)
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
          {guest.lastEmailedAt && (
            <span className="pill" title={`Last emailed ${new Date(guest.lastEmailedAt).toLocaleString()}`}>
              Emailed
            </span>
          )}
        </div>
        {guest.email ? <p className="guest-email muted">{guest.email}</p> : null}
        {guest.rsvpMessage ? <p className="guest-email muted">“{guest.rsvpMessage}”</p> : null}
      </div>
      <div className="guest-row-actions">
        <button className={`rsvp rsvp-${guest.rsvp}`} onClick={cycleRsvp}>
          {guest.rsvp}
        </button>
        {guest.inviteUrl ? (
          <button
            type="button"
            className="icon-btn"
            aria-label={`Copy invite link for ${guest.name}`}
            title={copied ? 'Copied!' : guest.inviteUrl}
            onClick={copyInviteLink}
          >
            {copied ? '✓' : <LinkIcon />}
          </button>
        ) : null}
        <button
          type="button"
          className="icon-btn"
          aria-label={`Edit ${guest.name}`}
          onClick={startEdit}
          disabled={removing}
        >
          <EditIcon />
        </button>
        <button
          type="button"
          className="icon-btn icon-btn-danger"
          aria-label={`Delete ${guest.name}`}
          onClick={remove}
          disabled={removing}
        >
          <TrashIcon />
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

  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const filtered = useMemo(() => guests.filter((g) => matches(g, filters)), [guests, filters])
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  // Clamp rather than reset, so deleting the last guest on a page doesn't strand you on an empty one
  const currentPage = Math.min(page, pageCount)
  const start = (currentPage - 1) * pageSize
  const visible = filtered.slice(start, start + pageSize)
  const isFiltered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS)

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((f) => ({ ...f, [key]: value }))
    setPage(1)
  }

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
      <GuestImport onImported={onChange} />
      <div className="add-form guest-filters">
        <input
          type="search"
          className="guest-search"
          aria-label="Search guests"
          placeholder="Search name, email, group or message"
          value={filters.search}
          onChange={(e) => updateFilter('search', e.target.value)}
        />
        <select
          className="budget-input"
          aria-label="Filter by RSVP"
          value={filters.rsvp}
          onChange={(e) => updateFilter('rsvp', e.target.value as RsvpFilter)}
        >
          <option value="all">Any RSVP</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
          <option value="pending">Pending</option>
        </select>
        <select
          className="budget-input"
          aria-label="Filter by overnight"
          value={filters.overnight}
          onChange={(e) => updateFilter('overnight', e.target.value as OvernightFilter)}
        >
          <option value="all">Overnight or not</option>
          <option value="yes">Staying overnight</option>
          <option value="no">Not staying</option>
        </select>
        <select
          className="budget-input"
          aria-label="Filter by email"
          value={filters.email}
          onChange={(e) => updateFilter('email', e.target.value as EmailFilter)}
        >
          <option value="all">Any email status</option>
          <option value="has">Has email</option>
          <option value="none">No email</option>
          <option value="emailed">Emailed</option>
          <option value="not-emailed">Not yet emailed</option>
        </select>
        {isFiltered && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setFilters(NO_FILTERS)
              setPage(1)
            }}
          >
            Clear
          </button>
        )}
      </div>
      <ul className="list guest-list">
        {visible.map((g) => (
          <GuestRow key={g.id} guest={g} onChange={onChange} />
        ))}
      </ul>
      {filtered.length === 0 && guests.length > 0 && (
        <p className="muted guest-empty">No guests match these filters.</p>
      )}
      {filtered.length > 0 && (
        <div className="guest-pagination">
          <span className="muted">
            {start + 1}–{start + visible.length} of {filtered.length}
            {isFiltered ? ` (filtered from ${guests.length})` : ''}
          </span>
          <div className="guest-pagination-controls">
            <select
              className="budget-input"
              aria-label="Guests per page"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                setPage(1)
              }}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n} per page
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setPage(currentPage - 1)}
              disabled={currentPage <= 1}
            >
              Prev
            </button>
            <span className="muted">
              Page {currentPage} of {pageCount}
            </span>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setPage(currentPage + 1)}
              disabled={currentPage >= pageCount}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
