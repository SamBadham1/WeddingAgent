# WeddingAgent

A wedding planning assistant. Track your **guest list**, **budget**, and **task
checklist**, and ask a built-in planning **agent** what to do next.

The stack is a single TypeScript app:

- **Frontend** — React + Vite (dev server on port `5173`)
- **Backend** — Express API with an in-memory data store (port `3001`)
- **Agent** — a rule-based planning assistant, so no external API keys are required

## Getting started

```bash
npm install      # install dependencies
npm run dev      # start the API (3001) and web (5173) dev servers together
```

Then open http://localhost:5173.

### Useful scripts

| Script            | Description                                    |
| ----------------- | ---------------------------------------------- |
| `npm run dev`     | Run the API and web dev servers concurrently   |
| `npm run dev:api` | Run only the Express API (with hot reload)     |
| `npm run dev:web` | Run only the Vite frontend                     |
| `npm run build`   | Type-check and produce a production web build  |
| `npm run typecheck` | Type-check the whole project                 |

## API overview

| Method | Route                | Description                          |
| ------ | -------------------- | ------------------------------------ |
| GET    | `/api/health`        | Health check                         |
| GET    | `/api/wedding`       | Wedding summary + budget totals      |
| GET    | `/api/guests`        | List guests                          |
| POST   | `/api/guests`        | Add a guest                          |
| PATCH  | `/api/guests/:id`    | Update a guest's RSVP                 |
| GET    | `/api/tasks`         | List tasks                           |
| POST   | `/api/tasks`         | Add a task                           |
| PATCH  | `/api/tasks/:id`     | Toggle a task's done state            |
| GET    | `/api/budget`        | List budget line items               |
| POST   | `/api/agent`         | Ask the planning agent a question    |

## Cloud Agent environment

`.cursor/environment.json` configures the Cloud Agent environment: it runs
`npm install`, then starts the `api` and `web` dev servers as persistent
terminals.
