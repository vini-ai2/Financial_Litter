import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FinanceDashboard } from "@/components/finance-dashboard";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { StatePanel } from "@/components/ui/product";
import { restoreAccessToken } from "@/lib/api";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Your finances · FinLitter" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    restoreAccessToken().then((hasSession) => {
      if (!active) return;
      if (hasSession) setReady(true);
      else void navigate({ to: "/login", replace: true });
    }).catch((reason) => {
      if (active) { setError(reason instanceof Error ? reason.message : "Could not reconnect to FinLitter."); setReady(true); }
    });
    return () => { active = false; };
  }, [navigate, retry]);

  if (!ready && !error) return <main className="screen-state"><div className="loading-mark" /><p role="status">Restoring your workspace…</p></main>;
  if (error) return <main className="screen-state"><StatePanel tone="error" title="Your workspace is unavailable" action={<button className="button button--primary" onClick={() => { setError(""); setReady(false); setRetry((value) => value + 1); }}>Try again</button>}>{error}</StatePanel></main>;

  return <AuthenticatedShell active="overview"><div className="dashboard-page space-y-8"><FinanceDashboard /></div></AuthenticatedShell>;
}
