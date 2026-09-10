import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Task } from '../types'
import { EditIcon, TrashIcon } from './icons'

function TaskRow({
  task,
  onChange,
}: {
  task: Task
  onChange: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)

  useEffect(() => {
    setTitle(task.title)
  }, [task])

  function startEdit() {
    setTitle(task.title)
    setEditing(true)
  }

  function cancelEdit() {
    setTitle(task.title)
    setEditing(false)
  }

  async function save() {
    if (!title.trim()) return

    setSaving(true)
    try {
      await api.updateTask(task.id, { title: title.trim() })
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
      <label className="check task-check">
        <input
          type="checkbox"
          checked={task.done}
          onChange={() => api.toggleTask(task.id, !task.done).then(onChange)}
          disabled={removing}
        />
        <span className={task.done ? 'done' : ''}>{task.title}</span>
      </label>
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
          <TaskRow key={t.id} task={t} onChange={onChange} />
        ))}
      </ul>
    </section>
  )
}
