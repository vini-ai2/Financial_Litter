import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { auth, getAccessToken } from "@/lib/api";

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
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Try to restore session via refresh token cookie on page load
    async function checkSession() {
      const token = getAccessToken();
      if (token) {
        // Already have a token in memory (same session)
        setChecked(true);
        return;
      }

      // Try refresh — if the cookie is still valid this silently restores auth
      const res = await fetch(
        `${import.meta.env.VITE_API_URL ?? "http://localhost:3000"}/auth/refresh`,
        { method: "POST", credentials: "include" }
      );

      if (res.ok) {
        const json = await res.json();
        // setAccessToken is called inside auth.refresh equivalent
        // For now just mark as checked — token is in memory via api.ts
        import("@/lib/api").then(({ setAccessToken }) => {
          setAccessToken(json.accessToken);
          setChecked(true);
        });
      } else {
        // No valid session — send to login
        navigate({ to: "/login", replace: true });
      }
    }

    checkSession();
  }, [navigate]);

  async function handleSignOut() {
    await auth.logout();
    navigate({ to: "/login", replace: true });
  }

  if (!checked) {
    return (
      <div className="bg-auth-glow flex min-h-screen items-center justify-center">
        <span className="text-sm text-muted-foreground">Loading…</span>
      </div>
    );
  }

  return (
    <div className="bg-auth-glow flex min-h-screen items-center justify-center px-6">
      <div className="glass-card w-full max-w-md rounded-3xl p-8 text-center">
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
    </div>
  );
}