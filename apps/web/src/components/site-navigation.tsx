import { Link } from "@tanstack/react-router";

type SiteNavigationProps = { active: "overview" | "investments" };

export function SiteNavigation({ active }: SiteNavigationProps) {
  const linkClass = (key: SiteNavigationProps["active"]) =>
    `rounded-md px-3 py-2 font-ui text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
      active === key
        ? "bg-secondary text-foreground"
        : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
    }`;

  return (
    <nav aria-label="Main navigation" className="app-navigation flex items-center justify-between gap-4 border-b border-border py-4 sm:py-5">
      <Link to="/" className="flex items-center gap-3 text-foreground">
        <span className="grid size-8 place-items-center rounded-md bg-primary font-ui text-sm font-bold text-primary-foreground">F</span>
        <span className="font-ui text-sm font-semibold tracking-tight">FinLitter</span>
      </Link>
      <div className="app-navigation__links flex items-center gap-1">
        <Link to="/" aria-current={active === "overview" ? "page" : undefined} className={linkClass("overview")}>Overview</Link>
        <Link to="/investments" aria-current={active === "investments" ? "page" : undefined} className={linkClass("investments")}>Investments</Link>
      </div>
    </nav>
  );
}
