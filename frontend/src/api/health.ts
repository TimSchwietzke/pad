export interface Health {
  status: string
  service: string
  user?: string
}

// Calls the backend liveness probe through the Vite /api proxy.
export async function fetchHealth(): Promise<Health> {
  const res = await fetch('/api/health')
  if (!res.ok) {
    throw new Error(`health check failed: ${res.status}`)
  }
  return (await res.json()) as Health
}
