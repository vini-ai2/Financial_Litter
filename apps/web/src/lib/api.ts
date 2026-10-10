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

async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? "The request could not be completed");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const send = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export const financeApi = {
  dashboard: () => requestJson<any>("/finance/dashboard"),
  transactions: (filters: { month?: string; type?: string; category?: string }) => {
    const query = new URLSearchParams();
    if (filters.month) query.set("month", filters.month);
    if (filters.type) query.set("type", filters.type);
    if (filters.category) query.set("category", filters.category);
    return requestJson<any[]>(`/transactions?${query.toString()}`);
  },
  createAccount: (data: unknown) => requestJson<any>("/accounts", send("POST", data)),
  updateAccount: (id: string, data: unknown) => requestJson<any>(`/accounts/${id}`, send("PUT", data)),
  createIncome: (data: unknown) => requestJson<any>("/income-sources", send("POST", data)),
  deleteIncome: (id: string) => requestJson<void>(`/income-sources/${id}`, send("DELETE")),
  updateIncome: (id: string, data: unknown) => requestJson<any>(`/income-sources/${id}`, send("PUT", data)),
  createTransaction: (data: unknown) => requestJson<any>("/transactions", send("POST", data)),
  updateTransaction: (id: string, data: unknown) => requestJson<any>(`/transactions/${id}`, send("PUT", data)),
  deleteTransaction: (id: string) => requestJson<void>(`/transactions/${id}`, send("DELETE")),
  createLoan: (data: unknown) => requestJson<any>("/finance/loans", send("POST", data)),
  updateLoan: (id: string, data: unknown) => requestJson<any>(`/finance/loans/${id}`, send("PUT", data)),
  deleteLoan: (id: string) => requestJson<void>(`/finance/loans/${id}`, send("DELETE")),
  createBudget: (data: unknown) => requestJson<any>("/finance/budgets", send("POST", data)),
  updateBudget: (id: string, data: unknown) => requestJson<any>(`/finance/budgets/${id}`, send("PUT", data)),
  deleteBudget: (id: string) => requestJson<void>(`/finance/budgets/${id}`, send("DELETE")),
  createBill: (data: unknown) => requestJson<any>("/finance/bills", send("POST", data)),
  updateBill: (id: string, data: unknown) => requestJson<any>(`/finance/bills/${id}`, send("PUT", data)),
  deleteBill: (id: string) => requestJson<void>(`/finance/bills/${id}`, send("DELETE")),
  setCreditScore: (score: number) => requestJson<{ score: number }>("/finance/credit-score", send("PUT", { score })),
};

export const auth = {
  signup: (data: { email: string; password: string; firstName: string; lastName: string; phone: string }) => apiSignup(data),
  login: (email: string, password: string) => apiLogin({ email, password }),
  logout: () => apiLogout(),
};
