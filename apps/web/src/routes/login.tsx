import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";

import { AuthShell } from "@/components/auth-shell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in — Financial Litter" },
      {
        name: "description",
        content:
          "Log in to Financial Litter to follow your portfolio, markets and news in one clean feed.",
      },
      { property: "og:title", content: "Log in — Financial Litter" },
      {
        property: "og:description",
        content:
          "Log in to Financial Litter to follow your portfolio, markets and news in one clean feed.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

const loginSchema = z.object({
  email: z.string().trim().email({ message: "Enter a valid email address" }),
  password: z.string().min(1, { message: "Enter your password" }),
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your details");
      return;
    }

    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    navigate({ to: "/" });
  }

  return (
    <AuthShell>
      <div className="glass-card w-full max-w-[440px] rounded-3xl p-6 sm:p-8">
        <h2 className="font-display text-2xl font-bold tracking-tight">
          Welcome back
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Log in to your Financial Litter account.
        </p>

        <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="field-label">Email</span>
            <input
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="field-input"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="field-label">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="field-input"
            />
          </label>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="mt-3 w-full rounded-xl bg-primary py-3.5 text-[15px] font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-60"
          >
            {loading ? "Logging in…" : "Log in"}
          </button>
        </form>

        <p className="mt-5 text-center text-[13px] text-muted-foreground">
          New to Financial Litter?{" "}
          <Link to="/signup" className="font-medium text-primary">
            Create an account
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
