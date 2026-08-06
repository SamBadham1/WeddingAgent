import express, { type Request, type Response, type NextFunction } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createGuest,
  createTask,
  getBudget,
  getGuests,
  getPlanningContext,
  getTasks,
  getWeddingSummary,
  seedIfEmpty,
  updateGuestRsvp,
  updateTaskDone,
} from './db/store.js'
import type { Guest } from './db/types.js'

const app = express()
app.use(express.json())

// Cloud Run injects PORT (defaults to 8080); fall back to 3001 for local dev.
const PORT = Number(process.env.PORT ?? 3001)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// Wedding "agent" — rule-based planning assistant (no external LLM required)
// ---------------------------------------------------------------------------

function planningReply(
  message: string,
  ctx: Awaited<ReturnType<typeof getPlanningContext>>,
): string {
  const { wedding, guests, tasks, budget } = ctx
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

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next)
  }
}

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'wedding-agent', time: new Date().toISOString() })
})

app.get(
  '/api/wedding',
  asyncHandler(async (_req, res) => {
    res.json(await getWeddingSummary())
  }),
)

app.get(
  '/api/guests',
  asyncHandler(async (_req, res) => {
    res.json(await getGuests())
  }),
)

app.post(
  '/api/guests',
  asyncHandler(async (req, res) => {
    const { name, group } = req.body ?? {}
    if (typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({ error: 'name is required' })
      return
    }
    const guest = await createGuest(
      name.trim(),
      typeof group === 'string' && group.trim() !== '' ? group.trim() : 'Other',
    )
    res.status(201).json(guest)
  }),
)

app.patch(
  '/api/guests/:id',
  asyncHandler(async (req, res) => {
    const { rsvp } = req.body ?? {}
    if (rsvp !== 'yes' && rsvp !== 'no' && rsvp !== 'pending') {
      const guest = await getGuests().then((list) =>
        list.find((g) => g.id === Number(req.params.id)),
      )
      if (!guest) {
        res.status(404).json({ error: 'guest not found' })
        return
      }
      res.json(guest)
      return
    }
    const guest = await updateGuestRsvp(Number(req.params.id), rsvp as Guest['rsvp'])
    if (!guest) {
      res.status(404).json({ error: 'guest not found' })
      return
    }
    res.json(guest)
  }),
)

app.get(
  '/api/tasks',
  asyncHandler(async (_req, res) => {
    res.json(await getTasks())
  }),
)

app.post(
  '/api/tasks',
  asyncHandler(async (req, res) => {
    const { title, dueWeeksBefore } = req.body ?? {}
    if (typeof title !== 'string' || title.trim() === '') {
      res.status(400).json({ error: 'title is required' })
      return
    }
    const task = await createTask(
      title.trim(),
      Number.isFinite(dueWeeksBefore) ? Number(dueWeeksBefore) : 8,
    )
    res.status(201).json(task)
  }),
)

app.patch(
  '/api/tasks/:id',
  asyncHandler(async (req, res) => {
    const { done } = req.body ?? {}
    if (typeof done !== 'boolean') {
      const task = await getTasks().then((list) =>
        list.find((t) => t.id === Number(req.params.id)),
      )
      if (!task) {
        res.status(404).json({ error: 'task not found' })
        return
      }
      res.json(task)
      return
    }
    const task = await updateTaskDone(Number(req.params.id), done)
    if (!task) {
      res.status(404).json({ error: 'task not found' })
      return
    }
    res.json(task)
  }),
)

app.get(
  '/api/budget',
  asyncHandler(async (_req, res) => {
    res.json(await getBudget())
  }),
)

app.post(
  '/api/agent',
  asyncHandler(async (req, res) => {
    const { message } = req.body ?? {}
    if (typeof message !== 'string' || message.trim() === '') {
      res.status(400).json({ error: 'message is required' })
      return
    }
    const ctx = await getPlanningContext()
    res.json({ reply: planningReply(message, ctx) })
  }),
)

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[wedding-agent] request error:', err)
  res.status(500).json({ error: 'internal server error' })
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

// ---------------------------------------------------------------------------
// Startup: seed Firestore if empty, then listen
// ---------------------------------------------------------------------------

async function start() {
  await seedIfEmpty()
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[wedding-agent] listening on http://0.0.0.0:${PORT}`)
  })
}

start().catch((err) => {
  console.error('[wedding-agent] failed to start:', err)
  process.exit(1)
})
