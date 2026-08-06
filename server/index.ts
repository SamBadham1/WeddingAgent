import express, { type Request, type Response } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const app = express()
app.use(express.json())

// Cloud Run injects PORT (defaults to 8080); fall back to 3001 for local dev.
const PORT = Number(process.env.PORT ?? 3001)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// Types & in-memory data store
// ---------------------------------------------------------------------------

interface Guest {
  id: number
  name: string
  rsvp: 'yes' | 'no' | 'pending'
  group: string
}

interface Task {
  id: number
  title: string
  done: boolean
  dueWeeksBefore: number
}

interface BudgetItem {
  id: number
  category: string
  estimated: number
  actual: number
}

interface Wedding {
  coupleNames: string
  date: string
  totalBudget: number
}

let guestId = 4
let taskId = 6

const wedding: Wedding = {
  coupleNames: 'Alex & Sam',
  date: '2026-09-19',
  totalBudget: 30000,
}

const guests: Guest[] = [
  { id: 1, name: 'Jordan Rivera', rsvp: 'yes', group: 'Family' },
  { id: 2, name: 'Taylor Chen', rsvp: 'pending', group: 'Friends' },
  { id: 3, name: 'Morgan Patel', rsvp: 'no', group: 'Work' },
]

const tasks: Task[] = [
  { id: 1, title: 'Book venue', done: true, dueWeeksBefore: 40 },
  { id: 2, title: 'Send save-the-dates', done: true, dueWeeksBefore: 32 },
  { id: 3, title: 'Choose caterer', done: false, dueWeeksBefore: 24 },
  { id: 4, title: 'Order invitations', done: false, dueWeeksBefore: 16 },
  { id: 5, title: 'Finalize guest list', done: false, dueWeeksBefore: 12 },
]

const budget: BudgetItem[] = [
  { id: 1, category: 'Venue', estimated: 12000, actual: 12500 },
  { id: 2, category: 'Catering', estimated: 9000, actual: 0 },
  { id: 3, category: 'Photography', estimated: 3500, actual: 3200 },
]

// ---------------------------------------------------------------------------
// Wedding "agent" — rule-based planning assistant (no external LLM required)
// ---------------------------------------------------------------------------

function planningReply(message: string): string {
  const text = message.toLowerCase()
  const confirmed = guests.filter((g) => g.rsvp === 'yes').length
  const pending = guests.filter((g) => g.rsvp === 'pending').length
  const openTasks = tasks.filter((t) => !t.done)
  const spent = budget.reduce((sum, b) => sum + b.actual, 0)
  const estimated = budget.reduce((sum, b) => sum + b.estimated, 0)
  const remaining = wedding.totalBudget - spent

  if (text.includes('budget') || text.includes('cost') || text.includes('money')) {
    const overCategories = budget.filter((b) => b.actual > b.estimated)
    let reply =
      `You've spent $${spent.toLocaleString()} of your $${wedding.totalBudget.toLocaleString()} budget, ` +
      `leaving $${remaining.toLocaleString()}. Your estimates total $${estimated.toLocaleString()}.`
    if (overCategories.length > 0) {
      reply += ` Heads up: ${overCategories
        .map((b) => b.category)
        .join(', ')} came in over estimate.`
    }
    return reply
  }

  if (text.includes('guest') || text.includes('rsvp') || text.includes('invite')) {
    return (
      `You have ${guests.length} guests: ${confirmed} confirmed and ${pending} still pending. ` +
      (pending > 0
        ? `Consider sending a friendly reminder to the ${pending} pending guest(s) about two weeks before the date.`
        : `Everyone has responded — nice work!`)
    )
  }

  if (text.includes('task') || text.includes('todo') || text.includes('next') || text.includes('do')) {
    if (openTasks.length === 0) {
      return `All planning tasks are complete. Time to relax before the big day!`
    }
    const next = [...openTasks].sort((a, b) => b.dueWeeksBefore - a.dueWeeksBefore)[0]
    return (
      `You have ${openTasks.length} open task(s). The most time-sensitive is "${next.title}" ` +
      `(due about ${next.dueWeeksBefore} weeks before the wedding). Tackle that one next.`
    )
  }

  if (text.includes('date') || text.includes('when')) {
    return `The wedding for ${wedding.coupleNames} is planned for ${wedding.date}.`
  }

  return (
    `I'm your wedding planning assistant for ${wedding.coupleNames}. ` +
    `Ask me about your budget, guest list, or what task to do next. ` +
    `Right now you have ${openTasks.length} open task(s) and ${pending} pending RSVP(s).`
  )
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'wedding-agent', time: new Date().toISOString() })
})

app.get('/api/wedding', (_req: Request, res: Response) => {
  const spent = budget.reduce((sum, b) => sum + b.actual, 0)
  res.json({ ...wedding, spent, remaining: wedding.totalBudget - spent })
})

app.get('/api/guests', (_req: Request, res: Response) => {
  res.json(guests)
})

app.post('/api/guests', (req: Request, res: Response) => {
  const { name, group } = req.body ?? {}
  if (typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'name is required' })
  }
  const guest: Guest = {
    id: ++guestId,
    name: name.trim(),
    rsvp: 'pending',
    group: typeof group === 'string' && group.trim() !== '' ? group.trim() : 'Other',
  }
  guests.push(guest)
  res.status(201).json(guest)
})

app.patch('/api/guests/:id', (req: Request, res: Response) => {
  const guest = guests.find((g) => g.id === Number(req.params.id))
  if (!guest) return res.status(404).json({ error: 'guest not found' })
  const { rsvp } = req.body ?? {}
  if (rsvp === 'yes' || rsvp === 'no' || rsvp === 'pending') {
    guest.rsvp = rsvp
  }
  res.json(guest)
})

app.get('/api/tasks', (_req: Request, res: Response) => {
  res.json(tasks)
})

app.post('/api/tasks', (req: Request, res: Response) => {
  const { title, dueWeeksBefore } = req.body ?? {}
  if (typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'title is required' })
  }
  const task: Task = {
    id: ++taskId,
    title: title.trim(),
    done: false,
    dueWeeksBefore: Number.isFinite(dueWeeksBefore) ? Number(dueWeeksBefore) : 8,
  }
  tasks.push(task)
  res.status(201).json(task)
})

app.patch('/api/tasks/:id', (req: Request, res: Response) => {
  const task = tasks.find((t) => t.id === Number(req.params.id))
  if (!task) return res.status(404).json({ error: 'task not found' })
  const { done } = req.body ?? {}
  if (typeof done === 'boolean') task.done = done
  res.json(task)
})

app.get('/api/budget', (_req: Request, res: Response) => {
  res.json(budget)
})

app.post('/api/agent', (req: Request, res: Response) => {
  const { message } = req.body ?? {}
  if (typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({ error: 'message is required' })
  }
  res.json({ reply: planningReply(message) })
})

// ---------------------------------------------------------------------------
// Production: serve the built React app from the same server (single Cloud Run
// container). In dev the frontend is served by Vite and proxies /api here, so
// this block is skipped when the build output is absent.
// ---------------------------------------------------------------------------

const clientDir = path.join(__dirname, '..', 'dist')
if (fs.existsSync(clientDir)) {
  app.use(express.static(clientDir))
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.join(clientDir, 'index.html'))
  })
  console.log(`[wedding-agent] serving static client from ${clientDir}`)
}

// Bind to 0.0.0.0 so the container is reachable on Cloud Run.
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[wedding-agent] listening on http://0.0.0.0:${PORT}`)
})
