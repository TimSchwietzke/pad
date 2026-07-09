import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// Test runner config, kept separate from vite.config.ts so the production build
// stays free of test concerns. jsdom gives the components a DOM; the setup file
// wires up jest-dom matchers and the MSW request mocks. Tests don't need Fast
// Refresh, so esbuild handles JSX with the automatic runtime (no React import).
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  // mirror vite.config's `@` → src alias so component imports resolve in tests
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    css: false,
    restoreMocks: true,
  },
})
