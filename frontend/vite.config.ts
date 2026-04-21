import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/papers': 'http://localhost:8000',
      '/chat': 'http://localhost:8000',
      '/auth': 'http://localhost:8000',
      '/stats': 'http://localhost:8000',
      '/briefing': 'http://localhost:8000',
      '/recommendations': 'http://localhost:8000',
      '/tasks': 'http://localhost:8000',
      '/subscriptions': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
      '/files': 'http://localhost:8000',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
