import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/', // SPA root path — explicit for desktop/production builds
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
