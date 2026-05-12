import { fileURLToPath, URL } from 'node:url'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/', // SPA root path — explicit for desktop/production builds
  resolve: {
    alias: {
      '@': path.resolve(fileURLToPath(new URL('.', import.meta.url)), './src'),
    },
  },
  server: {
    // Frontend uses VITE_API_BASE / absolute backend URLs, so SPA routes like
    // /briefing and /stats must not be proxied away from the Vite dev server.
    port: 3000,
  },
  build: {
    outDir: 'dist', // FastAPI serves from frontend/dist/ in production mode
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
