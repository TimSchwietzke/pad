import { TodoDashboard } from './features/todo/TodoDashboard'

/**
 * Root of the pad app. For now it renders the ToDo dashboard directly; routing
 * between modules arrives once the second module (calendar) lands.
 */
export default function App() {
  return <TodoDashboard />
}
