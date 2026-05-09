import { useEffect, useState } from 'react'
import { checkHealth, type HealthResponse } from '../lib/api'

/**
 * Hook to check backend health status, including embedding availability.
 *
 * Polls /health once on mount. Returns loading state and the health response.
 */
export function useHealthCheck() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    checkHealth()
      .then((data) => {
        if (!cancelled) setHealth(data)
      })
      .catch(() => {
        // Health check failed — backend may not be running yet.
        // This is common in desktop mode during startup — the backend
        // sidecar takes time to start. We leave health as null.
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  return { health, isLoading }
}