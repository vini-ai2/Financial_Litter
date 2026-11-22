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
    const message = body.error ?? body.message ?? "The request could not be completed";
    if (response.status === 401 && !["/auth/login", "/auth/signup", "/auth/refresh"].includes(path)) {
      clearAccessToken();
      if (typeof window !== "undefined" && window.location.pathname !== "/login" && window.location.pathname !== "/signup") {
        window.location.replace("/login");
      }
    }
    throw new Error(message);
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
  loans: () => requestJson<any[]>("/finance/loans"),
  updateLoan: (id: string, data: unknown) => requestJson<any>(`/finance/loans/${id}`, send("PUT", data)),
  deleteLoan: (id: string) => requestJson<void>(`/finance/loans/${id}`, send("DELETE")),
  createBudget: (data: unknown) => requestJson<any>("/finance/budgets", send("POST", data)),
  updateBudget: (id: string, data: unknown) => requestJson<any>(`/finance/budgets/${id}`, send("PUT", data)),
  deleteBudget: (id: string) => requestJson<void>(`/finance/budgets/${id}`, send("DELETE")),
  goals: (status?: GoalStatus) => requestJson<FinancialGoal[]>(`/finance/goals${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  eligibleGoalTransactions: () => requestJson<Array<{ id: string; amount: string; type: "INCOME" | "EXPENSE"; category: string; description: string; date: string }>>("/finance/goals/eligible-transactions"),
  goal: (id: string) => requestJson<FinancialGoal>(`/finance/goals/${encodeURIComponent(id)}`),
  createGoal: (data: CreateFinancialGoal) => requestJson<FinancialGoal>("/finance/goals", send("POST", data)),
  updateGoal: (id: string, data: Partial<Pick<CreateFinancialGoal, "goalName" | "targetAmount" | "targetDate" | "contributionFrequency">> & { plannedContributionAmount?: string | null }) => requestJson<FinancialGoal>(`/finance/goals/${encodeURIComponent(id)}`, send("PUT", data)),
  setGoalStatus: (id: string, status: GoalStatus) => requestJson<FinancialGoal>(`/finance/goals/${encodeURIComponent(id)}/status`, send("PATCH", { status })),
  archiveGoal: (id: string) => requestJson<FinancialGoal>(`/finance/goals/${encodeURIComponent(id)}`, send("DELETE")),
  goalContributions: (id: string) => requestJson<GoalContribution[]>(`/finance/goals/${encodeURIComponent(id)}/contributions`),
  addGoalContribution: (id: string, data: { amount: string; note?: string; effectiveAt?: string; idempotencyKey: string }) => requestJson<GoalContribution>(`/finance/goals/${encodeURIComponent(id)}/contributions`, send("POST", data)),
  linkGoalTransaction: (id: string, transactionId: string) => requestJson<GoalContribution>(`/finance/goals/${encodeURIComponent(id)}/transactions`, send("POST", { transactionId })),
  reverseGoalContribution: (id: string, contributionId: string) => requestJson<GoalContribution>(`/finance/goals/${encodeURIComponent(id)}/contributions/${encodeURIComponent(contributionId)}/reversals`, send("POST")),
  goalPlan: (id: string, annualReturnPercent?: number) => requestJson<GoalPlan>(`/finance/goals/${encodeURIComponent(id)}/planning${annualReturnPercent === undefined ? "" : `?annualReturnPercent=${encodeURIComponent(String(annualReturnPercent))}`}`),
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

export type GoalStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED";
export type GoalCategory = "SAVINGS" | "PURCHASE" | "EMERGENCY_FUND" | "DEBT_REPAYMENT" | "INVESTMENT";
export type GoalFrequency = "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUALLY";
export type CreateFinancialGoal = {
  goalName: string; category: GoalCategory; targetAmount: string; startingBalance?: string;
  targetDate: string; contributionFrequency: GoalFrequency; plannedContributionAmount?: string;
  linkedLoanId?: string; includePortfolio: boolean;
};
export type FinancialGoal = CreateFinancialGoal & {
  id: string; status: GoalStatus; createdAt: string; updatedAt: string;
  currentAmount: string; progressAmount: string; progressPercent: number; shortfall: string;
  contributionTotal: string; portfolioCostBasis: string | null; loanOutstanding: string | null;
  loanPrincipalReduction: string | null; sourceStatus: "CURRENT" | "UNAVAILABLE";
};
export type GoalContribution = {
  id: string; budgetId: string; amount: string; type: "MANUAL" | "TRANSACTION" | "REVERSAL";
  effectiveAt: string; note: string | null; sourceTransactionId: string | null;
  reversesContributionId: string | null; active: boolean; reversedAt: string | null; createdAt: string;
};
export type GoalPlan = {
  shortfall: string; periodsUntilDeadline: number; requiredContributionPerPeriod: string | null;
  plannedContributionPerPeriod: string | null; plannedShortfallPerPeriod: string | null;
  completionEstimateMonths?: number | null;
  scenarios: Array<{ annualReturnPercent: number; monthsToTarget: number | null }>;
  assumptions: string;
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
export type NewsFeedFilters = { page?: number; pageSize?: number; category?: NewsCategory; region?: string; company?: string; from?: string; to?: string; q?: string; mode?: "all" | "personalized" | "saved" | "watched" };
export type NewsPreferences = { categories: NewsCategory[]; regions: string[]; companies: string[]; industries: string[]; topics: string[]; entities?: Array<{ id: string; canonicalName: string; type: "COMPANY" | "SECURITY" | "REGULATOR" | "SECTOR"; jurisdiction: string | null }>; topicOptions?: string[] };

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
  save: (id: string) => requestJson<void>(`/news/events/${encodeURIComponent(id)}/save`, send("POST")),
  unsave: (id: string) => requestJson<void>(`/news/events/${encodeURIComponent(id)}/save`, send("DELETE")),
  watchlist: () => requestJson<Array<{ id: string; kind: "COMPANY" | "INDUSTRY" | "TOPIC"; key: string; entity: { id: string; canonicalName: string } | null }>>("/news/watchlist"),
  addWatch: (kind: "COMPANY" | "INDUSTRY" | "TOPIC", value: string) => requestJson<any>("/news/watchlist", send("POST", { kind, value })),
  removeWatch: (id: string) => requestJson<void>(`/news/watchlist/${encodeURIComponent(id)}`, send("DELETE")),
  history: () => requestJson<any[]>("/news/history"),
  sourceStatus: () => requestJson<{ sources: Array<{ name: string; organization: string; url: string; lastRetrievedAt: string | null; lastSuccessfulFetchAt: string | null; documentCount: number; evidenceCount: number; latestFailureAt: string | null; latestFailureStage: string | null; latestFailureMessage: string | null; latestProcessingFailureAt: string | null; latestProcessingFailureStage: string | null; latestProcessingFailureMessage: string | null; attempts: number | null; status: "CURRENT" | "STALE" | "PENDING" | "ERROR" | "UNSUPPORTED" }> }>("/news/source-status"),
};

export const auth = {
  signup: (data: { email: string; password: string; firstName: string; lastName: string; phone: string }) => apiSignup(data),
  login: (email: string, password: string) => apiLogin({ email, password }),
  logout: () => apiLogout(),
};
