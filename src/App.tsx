import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './layout/AppLayout'
import { BudgetPage } from './pages/BudgetPage'
import { GuestsPage } from './pages/GuestsPage'
import { HomePage } from './pages/HomePage'
import { TasksPage } from './pages/TasksPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="budget" element={<BudgetPage />} />
          <Route path="guests" element={<GuestsPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
