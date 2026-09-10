import { useCallback, useEffect, useState } from 'react'
import { TaskSection } from '../components/TaskSection'
import { api } from '../api'
import type { Task } from '../types'

export function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    api
      .getTasks()
      .then((t) => {
        setTasks(t)
        setError(null)
      })
      .catch((e) => setError((e as Error).message))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  if (error) return <div className="error">⚠️ {error}</div>

  return <TaskSection tasks={tasks} onChange={refresh} />
}
