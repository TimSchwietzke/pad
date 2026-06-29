import { setupServer } from 'msw/node'
import { handlers } from './handlers'

/** The MSW request-mocking server shared across the test run (started in setup.ts). */
export const server = setupServer(...handlers)
