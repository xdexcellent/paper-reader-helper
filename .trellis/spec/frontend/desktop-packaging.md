# Frontend Desktop Packaging Spec

> Frontend-specific contracts for Tauri desktop packaging.

---

## Scope

Frontend changes needed for the desktop (Tauri) packaging. The bulk of the packaging spec is in [../backend/desktop-packaging.md](../backend/desktop-packaging.md).

---

## API Base URL Resolution

```typescript
// frontend/src/lib/api.ts

// Development (Vite dev server, cross-origin):
//   VITE_API_BASE = 'http://localhost:8000'  (default fallback)
//   .env.development: VITE_API_BASE=http://localhost:8000

// Production (desktop/same-origin):
//   VITE_API_BASE = ''  (empty string → relative fetch)
//   .env.production: VITE_API_BASE=

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'
```

### Wrong

```typescript
const API_BASE = 'http://localhost:8000' // hardcoded, breaks in desktop mode
```

### Correct

```typescript
const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'
// Empty string = same-origin, non-empty = absolute URL
```

---

## Vite Build Config

```typescript
// frontend/vite.config.ts — production build must serve from root
export default defineConfig({
  plugins: [react()],
  base: '/', // SPA root path (default, confirm explicitly)
  server: {
    port: 3000,
  },
  build: {
    outDir: 'dist', // default, this is where FastAPI will serve from
  },
  // ... test config
})
```

---

## Environment Files

| File | When Used | Key Variable |
|------|-----------|---------------|
| `.env.development` | `npm run dev` / `tauri dev` | `VITE_API_BASE=http://localhost:8000` |
| `.env.production` | `npm run build` / Tauri build | `VITE_API_BASE=` (empty, same-origin) |

---

## Tauri Dev Integration

```json
// frontend/package.json — new scripts
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "tauri": "tauri",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build"
  }
}
```

---

## Health Check (Tauri Startup)

When Tauri window loads, the frontend should poll `GET /health` until the backend sidecar is ready:

```typescript
async function waitForBackend(maxRetries = 30, intervalMs = 1000): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${API_BASE}/health`)
      if (res.ok) return true
    } catch { /* backend not up yet */ }
    await new Promise(r => setTimeout(r, intervalMs))
  }
  return false
}
```

In desktop mode this is critical because the sidecar takes time to start. In dev mode the backend is already running so it returns immediately.

---

## Cross-Reference

- Full packaging spec: [../backend/desktop-packaging.md](../backend/desktop-packaging.md)