import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App.tsx'
import './styles/tokens.scss'
import './App.scss'

// One query client for the whole app. Sharing a single cache is what lets the
// health check today — and todos, calendar, etc. later — dedupe requests and
// refetch on their own schedule.
const queryClient = new QueryClient()

// Order matters: tokens.scss defines the CSS variables that App.scss reads, so
// it has to be imported first.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
