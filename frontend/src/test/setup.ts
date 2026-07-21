import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { cleanup } from '@testing-library/react'
import { server } from './server'
import { resetToasts } from '../core/toast'

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

// Radix primitives (Popover, DropdownMenu) call a few DOM APIs jsdom doesn't
// implement. Stub them so the floating menus open/close under userEvent.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// An unhandled request usually means a missing mock — fail loudly rather than
// letting the real network (or a hang) into the test.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  cleanup()
  localStorage.clear() // isolate persisted preferences between tests
  resetToasts() // don't let a toast leak into the next test
})
afterAll(() => server.close())
