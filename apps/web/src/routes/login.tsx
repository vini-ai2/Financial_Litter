import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";

import { AuthShell } from "@/components/auth-shell";
import { auth } from "@/lib/api";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in – Financial Litter" },
      {
        name: "description",
        content:
          "Log in to Financial Litter to follow your portfolio, markets and news in one clean feed.",
      },
      { property: "og:title", content: "Log in – Financial Litter" },
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
  const [error, setError] =