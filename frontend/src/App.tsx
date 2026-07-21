import { TodoDashboard } from './features/todo/TodoDashboard'
import { Toaster } from './core/Toaster'

/**
 * Root of the pad app. For now it renders the ToDo dashboard directly; routing
 * between modules arrives once the second module (calendar) lands. The Toaster
 * sits alongside it so mutation failures surface app-wide.
 */
export default function App() {
  return (
    <>
      <TodoDashboard />
      <Toaster />
    </>
  )
}
