/** Error thrown when an API request comes back with a non-2xx status. */
export class ApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'

/**
 * Make a JSON request to the backend.
 *
 * Relative `/api` URLs go through Vite's dev proxy (and share the origin in
 * production), so callers never deal with the backend's address.
 *
 * @returns the parsed body, or `undefined` for a 204 No Content
 * @throws ApiError when the response status is not 2xx
 */
async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 204) {
    return undefined as T
  }

  const data = (await res.json().catch(() => null)) as unknown

  if (!res.ok) {
    // The backend uses a {"error":{code,message}} envelope; fall back to the status.
    const err = (data as { error?: { code?: string; message?: string } } | null)?.error
    throw new ApiError(res.status, err?.message ?? `request failed: ${res.status}`, err?.code)
  }
  return data as T
}

/** Typed helpers for the four verbs we use. */
export const http = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  del: (path: string) => request<void>('DELETE', path),
}
