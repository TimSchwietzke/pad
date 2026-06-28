import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The Go backend owns /api; Vite proxies to it in dev so the SPA can use
// same-origin relative URLs (and ship behind one origin in production).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8080',
    },
  },
})
