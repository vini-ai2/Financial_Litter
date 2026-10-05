import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Financial Litter — Money moves fast. Read it faster." },
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
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecked(true);
      if (!data.session) {
        navigate({ to: "/login", replace: true });
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT") return;
      setSession(nextSession);
      if (!nextSession) {
        navigate({ to: "/login", replace: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  }

  if (!checked || !session) {
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
          Signed in as{" "}
          <span className="font-medium text-foreground">
            {session.user.email}
          </span>
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
