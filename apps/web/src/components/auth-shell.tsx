import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { AuthBrandPanel } from "./auth-brand-panel";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-auth-glow relative min-h-screen w-full overflow-hidden text-foreground antialiased">
      <div className="relative z-10 mx-auto flex min-h-screen max-w-[1440px] flex-col px-6 sm:px-10 lg:px-16">
        <header className="auth-rise flex items-center justify-between py-6">
          <Link to="/login" className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-[10px] bg-primary">
              <span className="font-display text-lg font-extrabold leading-none text-primary-foreground">
                F
              </span>
            </div>
            <span className="font-display text-[1.15rem] font-extrabold tracking-tight">
              Financial Litter
            </span>
          </Link>
          <span className="hidden text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground sm:inline">
            Secure access
          </span>
        </header>

        <main className="grid flex-1 items-center gap-10 py-6 lg:grid-cols-2 lg:gap-14">
          <AuthBrandPanel />
          <section className="auth-rise auth-rise-2 order-1 flex flex-col items-center gap-4 lg:order-2">
            {children}
          </section>
        </main>

        <footer className="auth-rise auth-rise-3 flex items-center justify-between border-t border-border py-6 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <span>© 2026 Financial Litter</span>
          <span className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-primary" />
            Bank-grade encryption
          </span>
        </footer>
      </div>
    </div>
  );
}
