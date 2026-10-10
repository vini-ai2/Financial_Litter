import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { AuthShell } from "@/components/auth-shell";
import { auth } from "@/lib/api";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Sign up – Financial Litter" },
      {
        name: "description",
        content:
          "Create your Financial Litter account to track your portfolio, markets and news in one clean feed.",
      },
      { property: "og:title", content: "Sign up – Financial Litter" },
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
    try {
      await auth.signup({
        email: parsed.data.email,
        password: parsed.data.password,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        phone: parsed.data.mobileNumber,
      });
      // Auto-login after signup then redirect
      await auth.login(parsed.data.email, parsed.data.password);
      navigate({ to: "/" });
    } catch (err: any) {
      setError(err.message ?? "Signup failed");
    } finally {
      setLoading(false);
    }
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