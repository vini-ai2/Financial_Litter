import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { AuthShell } from "@/components/auth-shell";
import { auth } from "@/lib/api";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Sign up – Financial Litter" }] }),
  component: SignupPage,
});

const signupSchema = z.object({
  firstName: z.string().trim().min(1, { message: "Enter your first name" }).max(100),
  lastName: z.string().trim().min(1, { message: "Enter your last name" }).max(100),
  email: z.string().trim().email({ message: "Enter a valid email address" }).max(255),
  mobileNumber: z.string().trim().min(7, { message: "Enter a valid mobile number" }).max(20).regex(/^[+0-9][0-9\s-]*$/, { message: "Enter a valid mobile number" }),
  password: z.string().min(8, { message: "Password must be at least 8 characters" }).max(72),
});

function SignupPage() {
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const parsed = signupSchema.safeParse({ firstName, lastName, email, mobileNumber, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your details");
      return;
    }
    setLoading(true);
    try {
      await auth.signup({ email: parsed.data.email, password: parsed.data.password, firstName: parsed.data.firstName, lastName: parsed.data.lastName, phone: parsed.data.mobileNumber });
      await auth.login(parsed.data.email, parsed.data.password);
      await navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return <AuthShell>
    <div className="glass-card w-full max-w-[440px] rounded-3xl p-6 sm:p-8">
      <h2 className="font-display text-2xl font-bold tracking-tight">Create your account</h2>
      <p className="mt-1 text-sm text-muted-foreground">Two minutes, no paperwork.</p>
      <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5"><span className="field-label">First name</span><input className="field-input" autoComplete="given-name" value={firstName} onChange={e=>setFirstName(e.target.value)} required /></label>
          <label className="grid gap-1.5"><span className="field-label">Last name</span><input className="field-input" autoComplete="family-name" value={lastName} onChange={e=>setLastName(e.target.value)} required /></label>
        </div>
        <label className="grid gap-1.5"><span className="field-label">Email</span><input className="field-input" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label>
        <label className="grid gap-1.5"><span className="field-label">Mobile number</span><input className="field-input" type="tel" autoComplete="tel" value={mobileNumber} onChange={e=>setMobileNumber(e.target.value)} required /></label>
        <label className="grid gap-1.5"><span className="field-label">Password</span><input className="field-input" type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} required /></label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <button className="mt-1 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50" disabled={loading}>{loading?"Creating account…":"Create account"}</button>
      </form>
      <p className="mt-5 text-center text-sm text-muted-foreground">Already registered? <Link to="/login" className="font-semibold text-primary">Log in</Link></p>
    </div>
  </AuthShell>;
}
