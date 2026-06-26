/**
 * Shape of the backend's `GET /api/health` response.
 *
 * `user` is optional because it only shows up once a request has passed the
 * auth boundary: in local dev that's the fixed default user, later it's the
 * logged-in account.
 */
export interface Health {
  status: string
  service: string
  user?: string
}

/**
 * Ask the backend whether it's up.
 *
 * The request uses a relative `/api` URL on purpose. In dev, Vite proxies that
 * to the Go server; in production both sit behind the same origin. Either way
 * this code doesn't need to know the backend's address.
 *
 * @returns the parsed health payload when the server answers with a 2xx status
 * @throws Error when the server responds with anything other than 2xx, so the
 *   caller (React Query) lands in its error state instead of getting a
 *   half-valid object
 */
export async function fetchHealth(): Promise<Health> {
  const res = await fetch('/api/health')
  if (!res.ok) {
    throw new Error(`health check failed: ${res.status}`)
  }
  return (await res.json()) as Health
}
