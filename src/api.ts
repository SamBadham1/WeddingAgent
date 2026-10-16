import type {
  BudgetItem,
  DispatchResult,
  EmailTemplate,
  Guest,
  OutboxEmail,
  RenderedEmail,
  StageResult,
  Task,
  WeddingSummary,
} from './types'

const ADMIN_TOKEN_KEY = 'weddingAgent.adminToken'
/** Fired on window when the API rejects the stored admin token. */
export const ADMIN_TOKEN_REQUIRED_EVENT = 'admin-token-required'

export function getAdminToken(): string {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setAdminToken(token: string): void {
  try {
    if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token)
    else localStorage.removeItem(ADMIN_TOKEN_KEY)
  } catch {
    // storage unavailable (private window) — token lasts only for this request
  }
}

// Every dashboard call goes through here so it carries the admin token
function fetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  const token = getAdminToken()
  if (token) headers.set('x-admin-token', token)
  return window.fetch(input, { ...init, headers }).then((res) => {
    if (res.status === 401) {
      setAdminToken('')
      window.dispatchEvent(new Event(ADMIN_TOKEN_REQUIRED_EVENT))
    }
    return res
  })
}

function postJson(url: string, body?: unknown, method = 'POST') {
  return fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `Request failed: ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  getWedding: () => fetch('/api/wedding').then((r) => json<WeddingSummary>(r)),
  getGuests: () => fetch('/api/guests').then((r) => json<Guest[]>(r)),
  addGuest: (
    name: string,
    group: string,
    email = '',
    overnight = false,
  ) =>
    fetch('/api/guests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, group, email, overnight }),
    }).then((r) => json<Guest>(r)),
  setRsvp: (id: number, rsvp: Guest['rsvp']) =>
    fetch(`/api/guests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rsvp }),
    }).then((r) => json<Guest>(r)),
  updateGuest: (
    id: number,
    patch: Partial<Pick<Guest, 'name' | 'rsvp' | 'group' | 'email' | 'overnight'>>,
  ) =>
    fetch(`/api/guests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).then((r) => json<Guest>(r)),
  getTasks: () => fetch('/api/tasks').then((r) => json<Task[]>(r)),
  addTask: (title: string) =>
    fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    }).then((r) => json<Task>(r)),
  toggleTask: (id: number, done: boolean) =>
    fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done }),
    }).then((r) => json<Task>(r)),
  updateTask: (id: number, patch: Partial<Pick<Task, 'title' | 'done'>>) =>
    fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).then((r) => json<Task>(r)),
  deleteTask: (id: number) =>
    fetch(`/api/tasks/${id}`, { method: 'DELETE' }).then((r) => {
      if (!r.ok && r.status !== 204) {
        return r.json().then((body) => {
          throw new Error((body as { error?: string }).error ?? `Request failed: ${r.status}`)
        })
      }
    }),
  getBudget: () => fetch('/api/budget').then((r) => json<BudgetItem[]>(r)),
  addBudgetItem: (category: string, estimated: number, actual = 0) =>
    fetch('/api/budget', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, estimated, actual }),
    }).then((r) => json<BudgetItem>(r)),
  updateBudgetItem: (
    id: number,
    patch: Partial<Pick<BudgetItem, 'category' | 'estimated' | 'actual'>>,
  ) =>
    fetch(`/api/budget/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).then((r) => json<BudgetItem>(r)),
  updateTotalBudget: (totalBudget: number) =>
    fetch('/api/wedding', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ totalBudget }),
    }).then((r) => json<WeddingSummary>(r)),
  askAgent: (message: string) =>
    fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    }).then((r) => json<{ reply: string }>(r)),
  getEmailTemplates: () => fetch('/api/email/templates').then((r) => json<EmailTemplate[]>(r)),
  createEmailTemplate: (fields: Pick<EmailTemplate, 'name' | 'subject' | 'body'>) =>
    postJson('/api/email/templates', fields).then((r) => json<EmailTemplate>(r)),
  updateEmailTemplate: (
    id: string,
    patch: Partial<Pick<EmailTemplate, 'name' | 'subject' | 'body'>>,
  ) => postJson(`/api/email/templates/${id}`, patch, 'PATCH').then((r) => json<EmailTemplate>(r)),
  deleteEmailTemplate: (id: string) =>
    fetch(`/api/email/templates/${id}`, { method: 'DELETE' }).then((r) => {
      if (!r.ok) return json<never>(r)
    }),
  previewEmail: (subject: string, body: string, guestId?: number) =>
    postJson('/api/email/preview', { subject, body, guestId }).then((r) => json<RenderedEmail>(r)),
  stageEmails: (
    templateId: string,
    guestIds: number[],
    options: { sendAfter?: string; skipAlreadySent?: boolean } = {},
  ) =>
    postJson('/api/email/stage', { templateId, guestIds, ...options }).then((r) =>
      json<StageResult>(r),
    ),
  getOutbox: () =>
    fetch('/api/email/outbox').then((r) => json<{ dryRun: boolean; emails: OutboxEmail[] }>(r)),
  cancelEmail: (id: string) =>
    postJson(`/api/email/outbox/${id}/cancel`).then((r) => json<OutboxEmail>(r)),
  retryEmail: (id: string) =>
    postJson(`/api/email/outbox/${id}/retry`).then((r) => json<OutboxEmail>(r)),
  dispatchEmails: () => postJson('/api/email/dispatch').then((r) => json<DispatchResult>(r)),
}
