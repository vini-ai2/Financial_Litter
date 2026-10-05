import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";

import { AuthShell } from "@/components/auth-shell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Sign up — Financial Litter" },
      {
        name: "description",
        content:
          "Create your Financial Litter account to track your portfolio, markets and news in one clean feed.",
      },
      { property: "og:title", content: "Sign up — Financial Litter" },
      {
        property: "og:description",
        content:
          "Create your Financial Litter account to track your portfolio, markets and news in one clean feed.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SignupPage,
});

const signupSchema = z.object({
  firstName: z.string().trim().min(1, { message: "Enter your first name" }).max(100),
  lastName: z.string().trim().min(1, { message: "Enter your last name" }).max(100),
  email: z.string().trim().email({ message: "Enter a valid email address" }).max(255),
  mobileNumber: z
    .string()
    .trim()
    .min(7, { message: "Enter a valid mobile number" })
    .max(20, { message: "Mobile number is too long" })
    .regex(/^[+0-9][0-9\s-]*$/, { message: "Enter a valid mobile number" }),
  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters" })
    .max(72),
});

function SignupPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = signupSchema.safeParse({
      firstName,
      lastName,
      email,
      mobileNumber,
      password,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your details");
      return;
    }

    setLoading(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: {
          first_name: parsed.data.firstName,
          last_name: parsed.data.lastName,
          mobile_number: parsed.data.mobileNumber,
        },
        emailRedirectTo: window.location.origin,
      },
    });
    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    if (data.session === null) {
      setConfirmationSent(true);
      return;
    }
  }

  if (confirmationSent) {
    return (
      <AuthShell>
        <div className="glass-card w-full max-w-[440px] rounded-3xl p-6 text-center sm:p-8">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/15">
            <span className="font-display text-xl font-extrabold text-primary">✓</span>
          </div>
          <h2 className="font-display mt-5 text-2xl font-bold tracking-tight">
            Check your email
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            We sent a confirmation link to{" "}
            <span className="font-medium text-foreground">{email}</span>. Click
            it to activate your account, then log in.
          </p>
          <Link
            to="/login"
            className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-primary py-3.5 text-[15px] font-semibold text-primary-foreground transition hover:brightness-110"
          >
            Go to log in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="glass-card w-full max-w-[440px] rounded-3xl p-6 sm:p-8">
        <h2 className="font-display text-2xl font-bold tracking-tight">
          Create your account
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Two minutes, no paperwork.
        </p>

        <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="field-label">First name</span>
              <input
                type="text"
                autoComplete="given-name"
                placeholder="Ada"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                className="field-input"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="field-label">Last name</span>
              <input
                type="text"
                autoComplete="family-name"
                placeholder="Lovelace"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                className="field-input"
              />
            </label>
          </div>

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
            <span className="field-label">Mobile number</span>
            <input
              type="tel"
              autoComplete="tel"
              placeholder="+1 555 018 2200"
              value={mobileNumber}
              onChange={(event) => setMobileNumber(event.target.value)}
              className="field-input"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="field-label">Password</span>
            <input
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
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
            {loading ? "Creating account…" : "Sign up"}
          </button>
        </form>

        <p className="mt-5 text-center text-[13px] text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-primary">
            Log in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
