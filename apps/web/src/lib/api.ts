// apps/web/src/lib/api.ts

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

// In-memory token store — never localStorage (XSS risk)
let accessToken: string | null = null

export function setAccessToken(token: string) {
  accessToken = token
}

export function clearAccessToken() {
  accessToken = null
}

// Add this to src/lib/api.ts
export function getAccessToken(): string | null {
  return accessToken
}

// Base fetch wrapper that attaches the token automatically
async function apiFetch(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include', // sends httpOnly refresh token cookie automatically
  })

  // Token expired — try refresh once, then retry original request
  if (res.status === 401 && path !== '/auth/refresh') {
    const refreshed = await refreshAccessToken()
    if (refreshed) {
      headers['Authorization'] = `Bearer ${accessToken}`
      return fetch(`${BASE_URL}${path}`, {
        ...options,
        headers,
        credentials: 'include',
      })
    }
  }

  return res
}

// ── Auth calls ──────────────────────────────────────────

export async function apiSignup(data: {
  email: string
  password: string
  firstName: string
  lastName: string
  phone: string
}) {
  const res = await apiFetch('/auth/signup', {
    method: 'POST',
    body: JSON.stringify(data),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error ?? 'Signup failed')
  }

  return res.json()
}

export async function apiLogin(data: {
  email: string
  password: string
}) {
  const res = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error ?? 'Login failed')
  }

  const json = await res.json()
  setAccessToken(json.accessToken) // store in memory
  return json
}

export async function apiLogout() {
  await apiFetch('/auth/logout', { method: 'POST' })
  clearAccessToken()
}

async function refreshAccessToken(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include', // sends cookie
    })

    if (!res.ok) return false

    const json = await res.json()
    setAccessToken(json.accessToken)
    return true
  } catch {
    return false
  }
}