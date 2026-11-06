import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { AuthBrandPanel } from "./auth-brand-panel";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen w-full text-foreground antialiased">
      <div className="relative z-10 mx-auto flex min-h-screen max-w-[1440px] flex-col px-5 sm:px-10 lg:px-16">
        <header className="flex items-center justify-between border-b border-border py-5 sm:py-6">
          <Link to="/login" className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-md bg-primary">
              <span className="font-ui text-lg font-bold leading-none text-primary-foreground">
                F
              </span>
            </div>
            <span className="font-ui text-[1.05rem] font-semibold tracking-tight">
              Financial Litter
            </span>
          </Link>
        </header>

        <main className="grid flex-1 items-center gap-8 py-8 sm:py-10 lg:grid-cols-2 lg:gap-14">
          <AuthBrandPanel />
          <section className="order-2 flex flex-col items-center gap-4 lg:order-2">
            {children}
          </section>
        </main>

      </div>
    </div>
  );
}
