import { envLoaded } from './env.js'
void envLoaded
import express, { type Request, type Response, type NextFunction } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createBudgetItem,
  createGuest,
  createTask,
  getBudget,
  getGuests,
  getPlanningContext,
  getTasks,
  getWeddingSummary,
  seedIfEmpty,
  updateBudgetItem,
  updateGuest,
  updateTask,
  deleteTask,
  updateWeddingTotalBudget,
} from './db/store.js'

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
    const next = openTasks[0]
    return (
      `You have ${openTasks.length} open task(s). Next up: "${next.title}". Tackle that one next.`
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

app.patch(
  '/api/wedding',
  asyncHandler(async (req, res) => {
    const { totalBudget } = req.body ?? {}
    if (!Number.isFinite(totalBudget) || totalBudget < 0) {
      res.status(400).json({ error: 'totalBudget must be a non-negative number' })
      return
    }
    await updateWeddingTotalBudget(Number(totalBudget))
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
    const { name, group, email, overnight } = req.body ?? {}
    if (typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({ error: 'name is required' })
      return
    }
    if (email !== undefined && email !== null && typeof email !== 'string') {
      res.status(400).json({ error: 'email must be a string' })
      return
    }
    if (overnight !== undefined && typeof overnight !== 'boolean') {
      res.status(400).json({ error: 'overnight must be a boolean' })
      return
    }
    const guest = await createGuest(
      name.trim(),
      typeof group === 'string' && group.trim() !== '' ? group.trim() : 'Other',
      typeof email === 'string' ? email.trim() : '',
      overnight === true,
    )
    res.status(201).json(guest)
  }),
)

app.patch(
  '/api/guests/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const { name, group, rsvp, email, overnight } = req.body ?? {}
    const patch: Parameters<typeof updateGuest>[1] = {}

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim() === '') {
        res.status(400).json({ error: 'name must be a non-empty string' })
        return
      }
      patch.name = name.trim()
    }
    if (group !== undefined) {
      if (typeof group !== 'string' || group.trim() === '') {
        res.status(400).json({ error: 'group must be a non-empty string' })
        return
      }
      patch.group = group.trim()
    }
    if (rsvp !== undefined) {
      if (rsvp !== 'yes' && rsvp !== 'no' && rsvp !== 'pending') {
        res.status(400).json({ error: 'rsvp must be yes, no, or pending' })
        return
      }
      patch.rsvp = rsvp
    }
    if (email !== undefined) {
      if (typeof email !== 'string') {
        res.status(400).json({ error: 'email must be a string' })
        return
      }
      patch.email = email.trim()
    }
    if (overnight !== undefined) {
      if (typeof overnight !== 'boolean') {
        res.status(400).json({ error: 'overnight must be a boolean' })
        return
      }
      patch.overnight = overnight
    }

    if (Object.keys(patch).length === 0) {
      const existing = (await getGuests()).find((g) => g.id === id)
      if (!existing) {
        res.status(404).json({ error: 'guest not found' })
        return
      }
      res.json(existing)
      return
    }

    const guest = await updateGuest(id, patch)
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
    const { title } = req.body ?? {}
    if (typeof title !== 'string' || title.trim() === '') {
      res.status(400).json({ error: 'title is required' })
      return
    }
    const task = await createTask(title.trim())
    res.status(201).json(task)
  }),
)

app.patch(
  '/api/tasks/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const { title, done } = req.body ?? {}
    const patch: Parameters<typeof updateTask>[1] = {}

    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim() === '') {
        res.status(400).json({ error: 'title must be a non-empty string' })
        return
      }
      patch.title = title.trim()
    }
    if (done !== undefined) {
      if (typeof done !== 'boolean') {
        res.status(400).json({ error: 'done must be a boolean' })
        return
      }
      patch.done = done
    }

    if (Object.keys(patch).length === 0) {
      const existing = (await getTasks()).find((t) => t.id === id)
      if (!existing) {
        res.status(404).json({ error: 'task not found' })
        return
      }
      res.json(existing)
      return
    }

    const task = await updateTask(id, patch)
    if (!task) {
      res.status(404).json({ error: 'task not found' })
      return
    }
    res.json(task)
  }),
)

app.delete(
  '/api/tasks/:id',
  asyncHandler(async (req, res) => {
    const deleted = await deleteTask(Number(req.params.id))
    if (!deleted) {
      res.status(404).json({ error: 'task not found' })
      return
    }
    res.status(204).send()
  }),
)

app.get(
  '/api/budget',
  asyncHandler(async (_req, res) => {
    res.json(await getBudget())
  }),
)

app.post(
  '/api/budget',
  asyncHandler(async (req, res) => {
    const { category, estimated, actual } = req.body ?? {}
    if (typeof category !== 'string' || category.trim() === '') {
      res.status(400).json({ error: 'category is required' })
      return
    }
    if (!Number.isFinite(estimated) || estimated < 0) {
      res.status(400).json({ error: 'estimated must be a non-negative number' })
      return
    }
    const actualAmount = Number.isFinite(actual) ? Number(actual) : 0
    if (actualAmount < 0) {
      res.status(400).json({ error: 'actual must be a non-negative number' })
      return
    }
    const item = await createBudgetItem(category.trim(), Number(estimated), actualAmount)
    res.status(201).json(item)
  }),
)

app.patch(
  '/api/budget/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const { category, estimated, actual } = req.body ?? {}
    const patch: Parameters<typeof updateBudgetItem>[1] = {}

    if (category !== undefined) {
      if (typeof category !== 'string' || category.trim() === '') {
        res.status(400).json({ error: 'category must be a non-empty string' })
        return
      }
      patch.category = category.trim()
    }
    if (estimated !== undefined) {
      if (!Number.isFinite(estimated) || estimated < 0) {
        res.status(400).json({ error: 'estimated must be a non-negative number' })
        return
      }
      patch.estimated = Number(estimated)
    }
    if (actual !== undefined) {
      if (!Number.isFinite(actual) || actual < 0) {
        res.status(400).json({ error: 'actual must be a non-negative number' })
        return
      }
      patch.actual = Number(actual)
    }

    if (Object.keys(patch).length === 0) {
      const existing = (await getBudget()).find((b) => b.id === id)
      if (!existing) {
        res.status(404).json({ error: 'budget item not found' })
        return
      }
      res.json(existing)
      return
    }

    const item = await updateBudgetItem(id, patch)
    if (!item) {
      res.status(404).json({ error: 'budget item not found' })
      return
    }
    res.json(item)
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
  const { logFirestoreTarget } = await import('./db/firestore.js')
  logFirestoreTarget()
  await seedIfEmpty()
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[wedding-agent] listening on http://0.0.0.0:${PORT}`)
  })
}

start().catch((err) => {
  console.error('[wedding-agent] failed to start:', err)
  process.exit(1)
})
