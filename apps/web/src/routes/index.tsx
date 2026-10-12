import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { auth, getAccessToken, setAccessToken } from "@/lib/api";
import { FinanceDashboard } from "@/components/finance-dashboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Financial Litter – Money moves fast. Read it faster." },
      {
        name: "description",
        content:
          "Financial Litter turns market data, portfolios and news into one clean feed.",
      },
      { property: "og:title", content: "Financial Litter" },
      {
        property: "og:description",
        content:
          "Financial Litter turns market data, portfolios and news into one clean feed.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);

    async function checkSession() {
      try {
        const token = getAccessToken();
        if (token) {
          if (active) setChecked(true);
          return;
        }

        const res = await fetch(
          `${import.meta.env.VITE_API_URL ?? "http://localhost:3000"}/auth/refresh`,
          { method: "POST", credentials: "include", signal: controller.signal }
        );

        if (res.status === 401 || res.status === 403) {
          if (active) void navigate({ to: "/login", replace: true });
          return;
        }
        if (!res.ok) {
          throw new Error(`The API returned ${res.status}.`);
        }

        const json = await res.json();
        if (typeof json.accessToken !== "string" || !json.accessToken) {
          throw new Error("The API response did not include an access token.");
        }
        setAccessToken(json.accessToken);
        if (active) setChecked(true);
      } catch (error) {
        if (!active) return;
        setSessionError(
          error instanceof DOMException && error.name === "AbortError"
            ? "The API did not respond within 8 seconds. Make sure the backend is running on port 3000, then retry."
            : error instanceof TypeError
              ? "Could not connect to the API. Make sure the backend is running on port 3000, then retry."
              : error instanceof Error
                ? error.message
                : "Could not check your session. Please retry."
        );
        setChecked(true);
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void checkSession();
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [navigate, retryCount]);

  async function handleSignOut() {
    await auth.logout();
    navigate({ to: "/login", replace: true });
  }

  if (!checked && !sessionError) {
    return (
      <div className="bg-auth-glow flex min-h-screen items-center justify-center">
        <span className="text-sm text-muted-foreground">Loading…</span>
      </div>
    );
  }

  if (sessionError) {
    return (
      <div className="bg-auth-glow flex min-h-screen items-center justify-center px-4">
        <div className="glass-card w-full max-w-md rounded-3xl p-8 text-center">
          <h1 className="font-display text-xl font-bold">Can’t reach the finance service</h1>
          <p role="alert" className="mt-3 text-sm text-muted-foreground">{sessionError}</p>
          <button
            className="mt-6 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            onClick={() => {
              setChecked(false);
              setSessionError(null);
              setRetryCount((count) => count + 1);
            }}
          >
            Retry connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-auth-glow min-h-screen px-4 py-8 sm:px-6">
      <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="glass-card mx-auto w-full max-w-md rounded-3xl p-8 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary">
          <span className="font-display text-xl font-extrabold text-primary-foreground">
            F
          </span>
        </div>
        <h1 className="font-display mt-5 text-2xl font-bold tracking-tight">
          You're in.
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You are logged in to Financial Litter.
        </p>
        <button
          onClick={handleSignOut}
          className="mt-6 w-full rounded-xl border border-border bg-secondary/40 py-3 text-sm font-semibold text-foreground transition hover:bg-secondary"
        >
          Sign out
        </button>
        <p className="mt-4 text-[12px] text-muted-foreground">
          Wrong account?{" "}
          <Link to="/login" className="font-medium text-primary">
            Log in
          </Link>
        </p>
      </div>
      <FinanceDashboard />
      </div>
    </div>
  );
}
