// apps/web/src/lib/api.ts

function getApiBaseUrl() {
  const configuredUrl = import.meta.env?.VITE_API_URL;
  if (configuredUrl) return configuredUrl.replace(/\/$/, "")
  if (typeof window !== "undefined") return `${window.location.protocol}//${window.location.hostname}:3000`
  return "http://localhost:3000"
}

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

export async function restoreAccessToken(): Promise<boolean> {
  if (accessToken) return true

  const res = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  })
  if (!res.ok) return false

  const json = await res.json()
  if (typeof json.accessToken !== "string" || !json.accessToken) return false
  setAccessToken(json.accessToken)
  return true
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

  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers,
    credentials: 'include', // sends httpOnly refresh token cookie automatically
  })

  // Token expired — try refresh once, then retry original request
  if (res.status === 401 && path !== '/auth/refresh') {
    const refreshed = await refreshAccessToken()
    if (refreshed) {
      headers['Authorization'] = `Bearer ${accessToken}`
      return fetch(`${getApiBaseUrl()}${path}`, {
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
    const res = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
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
  calculateEmi: (data: { principal: number; annualRatePercent: number; tenureMonths: number }) =>
    requestJson<{ monthlyPayment: number }>("/finance/calculators/emi", send("POST", data)),
  calculateSip: (data: { monthlyPayment: number; annualEffectiveRatePercent: number; tenureMonths: number; timing: "MONTH_END" | "BEGINNING_OF_MONTH" }) =>
    requestJson<{ futureValue: number }>("/finance/calculators/sip", send("POST", data)),
  calculateCagr: (data: { beginningValue: number; endingValue: number; years: number }) =>
    requestJson<{ annualizedReturn: number }>("/finance/calculators/cagr", send("POST", data)),
  calculateFd: (data: { principal: number; annualNominalRatePercent: number; years: number; compoundingFrequency: number }) =>
    requestJson<{ maturityValue: number }>("/finance/calculators/fd", send("POST", data)),
};

export const stockInvestmentApi = {
  holdings: () => requestJson<any[]>("/investments/stocks/holdings"),
  portfolio: () => requestJson<any>("/investments/stocks/portfolio"),
  savePrice: (data: { exchange: "NSE" | "BSE"; symbol: string; price: string }) =>
    requestJson<{ exchange: "NSE" | "BSE"; symbol: string; price: string; source: string; asOf: string }>("/investments/stocks/prices", send("PUT", data)),
  rebalancePreview: (targets: Array<{ exchange: "NSE" | "BSE"; symbol: string; targetPercent: string }>) =>
    requestJson<{ totalMarketValue: string; lines: Array<{ exchange: "NSE" | "BSE"; symbol: string; currentAllocationPercent: string; targetAllocationPercent: string; deviationPercentagePoints: string; estimatedTradeAmount: string; action: "BUY" | "SELL" | "HOLD" }> }>("/investments/stocks/rebalance-preview", send("POST", { targets })),
  captureSnapshot: () => requestJson<{ snapshot: PortfolioSnapshotSummary; duplicate: boolean; holdings?: PortfolioSnapshotHolding[] }>("/investments/stocks/portfolio/snapshots", send("POST")),
  snapshotHistory: (range: { from?: string; to?: string } = {}) => {
    const query = new URLSearchParams();
    if (range.from) query.set("from", range.from);
    if (range.to) query.set("to", range.to);
    return requestJson<PortfolioSnapshotSummary[]>(`/investments/stocks/portfolio/snapshots?${query.toString()}`);
  },
  historicalValuation: (range: { from?: string; to?: string } = {}) => {
    const query = new URLSearchParams();
    if (range.from) query.set("from", range.from);
    if (range.to) query.set("to", range.to);
    return requestJson<PortfolioSnapshotSummary[]>(`/investments/stocks/portfolio/history?${query.toString()}`);
  },
  compareSnapshots: (from: string, to: string) => {
    const query = new URLSearchParams({ from, to });
    return requestJson<{ from: { id: string; capturedAt: string; valuationStatus: string }; to: { id: string; capturedAt: string; valuationStatus: string }; knownMarketValueChange: string; totalMarketValueChange: string | null; realizedPnlChange: string; knownUnrealizedPnlChange: string }>(`/investments/stocks/portfolio/history/comparison?${query.toString()}`);
  },
  snapshot: (id: string) => requestJson<PortfolioSnapshotSummary & { holdings: PortfolioSnapshotHolding[] }>(`/investments/stocks/portfolio/snapshots/${encodeURIComponent(id)}`),
  transactions: () => requestJson<any[]>("/investments/stocks/transactions"),
  createTransaction: (data: {
    exchange: "NSE" | "BSE";
    symbol: string;
    companyName?: string;
    side: "BUY" | "SELL";
    quantity: number;
    executionPrice: string;
    fees: string;
    tradeDate: string;
  }) => requestJson<any>("/investments/stocks/transactions", send("POST", data)),
  reverseTransaction: (id: string, reason: string) => requestJson<any>(`/investments/stocks/transactions/${encodeURIComponent(id)}/reversals`, send("POST", { reason })),
};

export type PortfolioSnapshotSummary = {
  id: string;
  capturedAt: string;
  valuationStatus: "COMPLETE" | "INCOMPLETE" | "STALE";
  activePositionCount: number;
  pricedPositionCount?: number;
  missingPriceCount: number;
  stalePriceCount: number;
  investedCostBasis: string;
  marketValueForPricedHoldings: string;
  totalMarketValue: string | null;
  realizedPnl: string;
  unrealizedPnlForPricedHoldings: string;
  totalUnrealizedPnl: string | null;
};

export type PortfolioSnapshotHolding = {
  exchange: "NSE" | "BSE";
  symbol: string;
  quantity: number;
  costBasis: string;
  averageCost: string;
  price: string | null;
  priceSource: string | null;
  priceAsOf: string | null;
  priceStatus: "CURRENT" | "STALE" | "MISSING";
  marketValue: string | null;
  realizedPnl: string;
  unrealizedPnl: string | null;
};

export type NewsCategory = "COMPANY_DEVELOPMENT" | "EARNINGS" | "REGULATORY_ACTION" | "MARKET_ECONOMIC" | "CORPORATE_ACTION" | "RISK";
export type NewsFeedFilters = { page?: number; pageSize?: number; category?: NewsCategory; region?: string; company?: string; from?: string; to?: string };
export type NewsPreferences = { categories: NewsCategory[]; regions: string[] };

export const newsApi = {
  events: (filters: NewsFeedFilters) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== "") query.set(key, String(value));
    return requestJson<{ items: any[]; total: number; page: number; pageSize: number; totalPages: number }>(`/news/events?${query.toString()}`);
  },
  event: (id: string) => requestJson<any>(`/news/events/${encodeURIComponent(id)}`),
  filters: () => requestJson<{ categories: NewsCategory[]; regions: string[] }>("/news/filters"),
  preferences: () => requestJson<NewsPreferences>("/news/preferences"),
  savePreferences: (preferences: NewsPreferences) => requestJson<NewsPreferences>("/news/preferences", send("PUT", preferences)),
};

export const auth = {
  signup: (data: { email: string; password: string; firstName: string; lastName: string; phone: string }) => apiSignup(data),
  login: (email: string, password: string) => apiLogin({ email, password }),
  logout: () => apiLogout(),
};
