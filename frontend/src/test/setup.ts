import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { cleanup } from '@testing-library/react'
import { server } from './server'

// jsdom doesn't implement matchMedia, which the dashboard reads to pick the
// initial light/dark mode. Stub it to "light" so the components mount.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
})

// An unhandled request usually means a missing mock — fail loudly rather than
// letting the real network (or a hang) into the test.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  cleanup()
  localStorage.clear() // isolate persisted preferences between tests
})
afterAll(() => server.close())
