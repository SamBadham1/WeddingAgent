import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import type { AgentMessage, BudgetItem, Guest, Task, WeddingSummary } from './types'

export default function App() {
  const [wedding, setWedding] = useState<WeddingSummary | null>(null)
  const [guests, setGuests] = useState<Guest[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [budget, setBudget] = useState<BudgetItem[]>([])
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    try {
      const [w, g, t, b] = await Promise.all([
        api.getWedding(),
        api.getGuests(),
        api.getTasks(),
        api.getBudget(),
      ])
      setWedding(w)
      setGuests(g)
      setTasks(t)
      setBudget(b)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  return (
    <div className="app">
      <header className="hero">
        <h1>💍 WeddingAgent</h1>
        {wedding && (
          <p className="subtitle">
            Planning <strong>{wedding.coupleNames}</strong> · {formatDate(wedding.date)}
          </p>
        )}
      </header>

      {error && <div className="error">⚠️ {error}</div>}

      <div className="grid">
        <BudgetCard wedding={wedding} budget={budget} />
        <GuestCard guests={guests} onChange={refresh} />
        <TaskCard tasks={tasks} onChange={refresh} />
        <AgentCard />
      </div>
    </div>
  )
}

function formatDate(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

function BudgetCard({ wedding, budget }: { wedding: WeddingSummary | null; budget: BudgetItem[] }) {
  if (!wedding) return <section className="card">Loading…</section>
  const pct = Math.min(100, Math.round((wedding.spent / wedding.totalBudget) * 100))
  return (
    <section className="card">
      <h2>Budget</h2>
      <div className="budget-summary">
        <span>
          <strong>${wedding.spent.toLocaleString()}</strong> spent
        </span>
        <span className="muted">of ${wedding.totalBudget.toLocaleString()}</span>
      </div>
      <div className="bar">
        <div className="bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <ul className="list">
        {budget.map((b) => (
          <li key={b.id} className="row">
            <span>{b.category}</span>
            <span className={b.actual > b.estimated ? 'over' : 'muted'}>
              ${b.actual.toLocaleString()} / ${b.estimated.toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function GuestCard({ guests, onChange }: { guests: Guest[]; onChange: () => void }) {
  const [name, setName] = useState('')
  const [group, setGroup] = useState('')
  const confirmed = guests.filter((g) => g.rsvp === 'yes').length

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await api.addGuest(name, group)
    setName('')
    setGroup('')
    onChange()
  }

  async function cycle(g: Guest) {
    const next: Guest['rsvp'] = g.rsvp === 'pending' ? 'yes' : g.rsvp === 'yes' ? 'no' : 'pending'
    await api.setRsvp(g.id, next)
    onChange()
  }

  return (
    <section className="card">
      <h2>
        Guests <span className="pill">{confirmed}/{guests.length} confirmed</span>
      </h2>
      <form className="add-form" onSubmit={add}>
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
        <button type="submit">Add</button>
      </form>
      <ul className="list">
        {guests.map((g) => (
          <li key={g.id} className="row">
            <span>
              {g.name} <span className="muted">· {g.group}</span>
            </span>
            <button className={`rsvp rsvp-${g.rsvp}`} onClick={() => cycle(g)}>
              {g.rsvp}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function TaskCard({ tasks, onChange }: { tasks: Task[]; onChange: () => void }) {
  const [title, setTitle] = useState('')
  const done = tasks.filter((t) => t.done).length

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    await api.addTask(title)
    setTitle('')
    onChange()
  }

  return (
    <section className="card">
      <h2>
        Tasks <span className="pill">{done}/{tasks.length} done</span>
      </h2>
      <form className="add-form" onSubmit={add}>
        <input
          aria-label="Task title"
          placeholder="New task"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button type="submit">Add</button>
      </form>
      <ul className="list">
        {tasks.map((t) => (
          <li key={t.id} className="row">
            <label className="check">
              <input
                type="checkbox"
                checked={t.done}
                onChange={() => api.toggleTask(t.id, !t.done).then(onChange)}
              />
              <span className={t.done ? 'done' : ''}>{t.title}</span>
            </label>
            <span className="muted">{t.dueWeeksBefore}w before</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function AgentCard() {
  const [messages, setMessages] = useState<AgentMessage[]>([
    { role: 'agent', text: 'Hi! Ask me about your budget, guests, or what to do next.' },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || busy) return
    setMessages((m) => [...m, { role: 'user', text }])
    setInput('')
    setBusy(true)
    try {
      const { reply } = await api.askAgent(text)
      setMessages((m) => [...m, { role: 'agent', text: reply }])
    } catch (err) {
      setMessages((m) => [...m, { role: 'agent', text: `Error: ${(err as Error).message}` }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card agent">
      <h2>Ask the Agent</h2>
      <div className="chat">
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form className="add-form" onSubmit={send}>
        <input
          aria-label="Message the agent"
          placeholder="e.g. How's my budget?"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" disabled={busy}>
          {busy ? '…' : 'Send'}
        </button>
      </form>
    </section>
  )
}
