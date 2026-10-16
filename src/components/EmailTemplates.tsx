import { useEffect, useState } from 'react'
import { api } from '../api'
import type { EmailTemplate, Guest, RenderedEmail } from '../types'

const PLACEHOLDERS = ['{{firstName}}', '{{name}}', '{{inviteUrl}}', '{{coupleNames}}', '{{date}}']

const STARTER: Pick<EmailTemplate, 'name' | 'subject' | 'body'> = {
  name: 'Invitation',
  subject: "You're invited — {{coupleNames}}",
  body:
    'Hi {{firstName}},\n\n' +
    "We're getting married! We'd love you to celebrate with us on {{date}}.\n\n" +
    'Please let us know if you can make it:\n{{inviteUrl}}\n\n' +
    'Love,\n{{coupleNames}}',
}

type Draft = Pick<EmailTemplate, 'name' | 'subject' | 'body'> & { id?: string }

export function EmailTemplates({
  templates,
  guests,
  onChange,
}: {
  templates: EmailTemplate[]
  guests: Guest[]
  onChange: () => void
}) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [previewGuestId, setPreviewGuestId] = useState<number | ''>('')
  const [preview, setPreview] = useState<RenderedEmail | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-render the preview shortly after the user stops typing
  useEffect(() => {
    if (!draft) return
    const timer = setTimeout(() => {
      api
        .previewEmail(draft.subject, draft.body, previewGuestId === '' ? undefined : previewGuestId)
        .then(setPreview)
        .catch(() => setPreview(null))
    }, 300)
    return () => clearTimeout(timer)
  }, [draft, previewGuestId])

  function edit(template: EmailTemplate) {
    setDraft({ id: template.id, name: template.name, subject: template.subject, body: template.body })
    setError(null)
  }

  async function save() {
    if (!draft) return
    setSaving(true)
    setError(null)
    try {
      const fields = { name: draft.name, subject: draft.subject, body: draft.body }
      if (draft.id) await api.updateEmailTemplate(draft.id, fields)
      else await api.createEmailTemplate(fields)
      setDraft(null)
      onChange()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!draft?.id || !window.confirm(`Delete the "${draft.name}" template?`)) return
    await api.deleteEmailTemplate(draft.id)
    setDraft(null)
    onChange()
  }

  return (
    <section className="card page-card">
      <h2>
        Email templates <span className="pill">{templates.length}</span>
      </h2>

      {!draft && (
        <>
          <ul className="list">
            {templates.map((t) => (
              <li key={t.id} className="row">
                <div>
                  <strong>{t.name}</strong>
                  <p className="muted email-subject">{t.subject}</p>
                </div>
                <button type="button" className="btn-secondary" onClick={() => edit(t)}>
                  Edit
                </button>
              </li>
            ))}
          </ul>
          {templates.length === 0 && (
            <p className="muted">No templates yet. Start with an invitation.</p>
          )}
          <button
            type="button"
            className="email-new-btn"
            onClick={() => setDraft(templates.length === 0 ? { ...STARTER } : { name: '', subject: '', body: '' })}
          >
            New template
          </button>
        </>
      )}

      {draft && (
        <div className="email-editor">
          <div className="email-editor-fields">
            <input
              className="budget-input"
              aria-label="Template name"
              placeholder="Template name (e.g. Invitation, Reminder)"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <input
              className="budget-input"
              aria-label="Subject"
              placeholder="Subject"
              value={draft.subject}
              onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
            />
            <textarea
              className="budget-input email-body-input"
              aria-label="Body"
              placeholder="Email body"
              rows={12}
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            />
            <p className="muted">
              Placeholders: {PLACEHOLDERS.map((p) => <code key={p}>{p}</code>)}
            </p>
            {!draft.body.includes('{{inviteUrl}}') && (
              <p className="over">This template has no {'{{inviteUrl}}'}, so guests won't get an RSVP link.</p>
            )}
            {error && <div className="error">⚠️ {error}</div>}
            <div className="budget-edit-actions">
              {draft.id && (
                <button type="button" className="btn-secondary" onClick={remove} disabled={saving}>
                  Delete
                </button>
              )}
              <button type="button" className="btn-secondary" onClick={() => setDraft(null)} disabled={saving}>
                Cancel
              </button>
              <button type="button" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save template'}
              </button>
            </div>
          </div>

          <div className="email-preview">
            <label className="muted">
              Preview for{' '}
              <select
                className="budget-input"
                value={previewGuestId}
                onChange={(e) => setPreviewGuestId(e.target.value === '' ? '' : Number(e.target.value))}
              >
                <option value="">Sample guest</option>
                {guests.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="email-preview-subject">{preview?.subject || '—'}</p>
            <iframe
              title="Email preview"
              sandbox=""
              className="email-preview-frame"
              srcDoc={preview?.html ?? ''}
            />
          </div>
        </div>
      )}
    </section>
  )
}
