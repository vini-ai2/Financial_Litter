import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { AuthShell } from "@/components/auth-shell";
import { auth } from "@/lib/api";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Log in – Financial Litter" }] }),
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
    try {
      await auth.login(parsed.data.email, parsed.data.password);
      await navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return <AuthShell>
    <div className="glass-card w-full max-w-[440px] rounded-3xl p-6 sm:p-8">
      <h2 className="font-display text-2xl font-bold tracking-tight">Welcome back</h2>
      <p className="mt-1 text-sm text-muted-foreground">Log in to your personal finance workspace.</p>
      <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4">
        <label className="grid gap-1.5"><span className="field-label">Email</span><input className="field-input" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label>
        <label className="grid gap-1.5"><span className="field-label">Password</span><input className="field-input" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required /></label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <button className="mt-1 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50" disabled={loading}>{loading?"Logging in…":"Log in"}</button>
      </form>
      <p className="mt-5 text-center text-sm text-muted-foreground">New here? <Link to="/signup" className="font-semibold text-primary">Create an account</Link></p>
    </div>
  </AuthShell>;
}
