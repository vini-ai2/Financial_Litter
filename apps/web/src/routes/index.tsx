import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { auth, getAccessToken, setAccessToken } from "@/lib/api";
import { FinanceDashboard } from "@/components/finance-dashboard";
import { AuthenticatedShell } from "@/components/authenticated-shell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Overview · Financial Litter" },
      {
        name: "description",
        content: "Review accounts, income, spending, savings and investment records.",
      },
      { property: "og:title", content: "Financial Litter" },
      {
        property: "og:description",
        content: "Review accounts, income, spending, savings and investment records.",
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
    <div className="flex min-h-screen items-center justify-center bg-background">
        <span className="text-sm text-muted-foreground">Loading…</span>
      </div>
    );
  }

  if (sessionError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="surface-panel w-full max-w-md rounded-lg p-6 text-center sm:p-8">
          <h1 className="font-display text-xl font-bold">Can’t reach the finance service</h1>
          <p role="alert" className="mt-3 text-sm text-muted-foreground">{sessionError}</p>
          <button
            className="mt-6 w-full rounded-md bg-primary py-3 font-ui text-sm font-semibold text-primary-foreground transition hover:brightness-110"
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
    <AuthenticatedShell active="overview">
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-end gap-4">
          <Link to="/login" className="font-ui text-sm text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground">Log in as another account</Link>
          <button onClick={handleSignOut} className="rounded-md border border-border bg-secondary/40 px-4 py-2 font-ui text-sm font-semibold text-foreground transition hover:bg-secondary">Sign out</button>
        </div>
        <FinanceDashboard />
      </div>
    </AuthenticatedShell>
  );
}
