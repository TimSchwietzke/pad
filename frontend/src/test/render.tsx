import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient } from '../core/queryClient'
import { Toaster } from '../core/Toaster'

/**
 * Renders a component inside a fresh React Query client (same config as prod,
 * including the mutation-error Toaster) so tests exercise the real error path.
 * Retries are off so a mocked error surfaces immediately, not after back-off.
 */
export function renderWithClient(ui: ReactElement) {
  const queryClient = createQueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        {ui}
        <Toaster />
      </QueryClientProvider>,
    ),
  }
}
