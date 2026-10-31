import { useEffect, useId, useMemo, useState } from 'react'
import { api } from '../api'
import type { Task } from '../types'
import { EditIcon, TrashIcon } from './icons'

function hasLabel(labels: string[], label: string) {
  return labels.some((l) => l.toLowerCase() === label.toLowerCase())
}

// Chips for the chosen labels plus an input whose dropdown lists every label already in use;
// typing a name that isn't listed creates a new label
function LabelPicker({
  labels,
  allLabels,
  onChange,
  disabled,
}: {
  labels: string[]
  allLabels: string[]
  onChange: (labels: string[]) => void
  disabled: boolean
}) {
  const listId = useId()
  const [draft, setDraft] = useState('')
  const options = allLabels.filter((l) => !hasLabel(labels, l))

  function add(value: string) {
    const label = value.trim()
    setDraft('')
    if (!label || hasLabel(labels, label)) return
    // Reuse the existing spelling so "venue" and "Venue" don't become two labels
    onChange([...labels, allLabels.find((l) => l.toLowerCase() === label.toLowerCase()) ?? label])
  }

  return (
    <div className="label-picker">
      {labels.map((l) => (
        <span key={l} className="pill label-chip">
          {l}
          <button
            type="button"
            className="label-remove"
            aria-label={`Remove label ${l}`}
            onClick={() => onChange(labels.filter((x) => x !== l))}
            disabled={disabled}
          >
            ×
          </button>
        </span>
      ))}
      <input
        className="budget-input label-input"
        aria-label="Add label"
        placeholder={options.length ? 'Pick or type a label' : 'New label'}
        list={listId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add(draft)
          }
        }}
        disabled={disabled}
      />
      <datalist id={listId}>
        {options.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
    </div>
  )
}

function TaskRow({
  task,
  allLabels,
  onChange,
}: {
  task: Task
  allLabels: string[]
  onChange: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes)
  const [labels, setLabels] = useState(task.labels)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)

  useEffect(() => {
    setTitle(task.title)
    setNotes(task.notes)
    setLabels(task.labels)
  }, [task])

  function startEdit() {
    setTitle(task.title)
    setNotes(task.notes)
    setLabels(task.labels)
    setEditing(true)
  }

  function cancelEdit() {
    setTitle(task.title)
    setNotes(task.notes)
    setLabels(task.labels)
    setEditing(false)
  }

  async function save() {
    if (!title.trim()) return

    setSaving(true)
    try {
      await api.updateTask(task.id, { title: title.trim(), notes: notes.trim(), labels })
      setEditing(false)
      onChange()
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!window.confirm(`Remove "${task.title}"?`)) return
    setRemoving(true)
    try {
      await api.deleteTask(task.id)
      onChange()
    } finally {
      setRemoving(false)
    }
  }

  if (editing) {
    return (
      <li className="row task-row task-row-editing">
        <input
          className="budget-input task-title-input"
          aria-label="Task title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={saving}
        />
        <textarea
          className="budget-input task-notes-input"
          aria-label="Task notes"
          placeholder="Notes, instructions or anything to action"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={saving}
        />
        <LabelPicker labels={labels} allLabels={allLabels} onChange={setLabels} disabled={saving} />
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
    <li className="row task-row">
      <div className="task-main">
        <label className="check task-check">
          <input
            type="checkbox"
            checked={task.done}
            onChange={() => api.toggleTask(task.id, !task.done).then(onChange)}
            disabled={removing}
          />
          <span className={task.done ? 'done' : ''}>{task.title}</span>
        </label>
        {task.labels.length > 0 && (
          <div className="task-labels">
            {task.labels.map((l) => (
              <span key={l} className="pill">
                {l}
              </span>
            ))}
          </div>
        )}
        {task.notes ? <p className="task-notes muted">{task.notes}</p> : null}
      </div>
      <div className="task-row-actions">
        <button
          type="button"
          className="icon-btn"
          aria-label={`Edit ${task.title}`}
          onClick={startEdit}
          disabled={removing}
        >
          <EditIcon />
        </button>
        <button
          type="button"
          className="icon-btn icon-btn-danger"
          aria-label={`Remove ${task.title}`}
          onClick={remove}
          disabled={removing}
        >
          <TrashIcon />
        </button>
      </div>
    </li>
  )
}

export function TaskSection({
  tasks,
  onChange,
}: {
  tasks: Task[]
  onChange: () => void
}) {
  const [title, setTitle] = useState('')
  const done = tasks.filter((t) => t.done).length
  // The label dropdown is built from labels already used on any task
  const allLabels = useMemo(() => {
    const byKey = new Map<string, string>()
    for (const t of tasks) for (const l of t.labels) if (!byKey.has(l.toLowerCase())) byKey.set(l.toLowerCase(), l)
    return [...byKey.values()].sort((a, b) => a.localeCompare(b))
  }, [tasks])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    await api.addTask(title)
    setTitle('')
    onChange()
  }

  return (
    <section className="card page-card">
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
          <TaskRow key={t.id} task={t} allLabels={allLabels} onChange={onChange} />
        ))}
      </ul>
    </section>
  )
}
