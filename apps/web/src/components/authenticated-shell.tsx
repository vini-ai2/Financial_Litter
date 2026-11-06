import type { ReactNode } from "react";

import { SiteNavigation } from "@/components/site-navigation";

type AuthenticatedShellProps = {
  active: "overview" | "investments" | "news";
  children: ReactNode;
};

export function AuthenticatedShell({ active, children }: AuthenticatedShellProps) {
  return (
    <div className="app-shell min-h-screen px-4 sm:px-6">
      <div className="app-shell__inner mx-auto w-full max-w-7xl">
        <SiteNavigation active={active} />
        <main className="app-shell__main">{children}</main>
      </div>
    </div>
  );
}
