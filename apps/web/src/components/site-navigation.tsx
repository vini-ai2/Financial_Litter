import { Link, useNavigate } from "@tanstack/react-router";
import { auth } from "@/lib/api";
import { ThemeToggle } from "./theme-provider";

type SiteNavigationProps = { active: "overview" | "goals" | "investments" | "calculators" | "news" };

export function SiteNavigation({ active }: SiteNavigationProps) {
  const navigate = useNavigate();
  const linkClass = (key: SiteNavigationProps["active"]) =>
    `app-navigation__link px-3 py-2 font-ui text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
      active === key
        ? "bg-secondary text-foreground"
        : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
    }`;

  async function signOut() {
    try { await auth.logout(); } catch { /* The login screen remains available if the API cannot be reached. */ }
    await navigate({ to: "/login", replace: true });
  }

  return <header className="app-navigation">
    <Link to="/dashboard" className="brand-lockup" aria-label="FinLitter dashboard"><span className="brand-mark">F</span><span className="brand-lockup__name">FinLitter</span></Link>
    <nav aria-label="Main navigation" className="app-navigation__links">
      <Link to="/dashboard" aria-current={active === "overview" ? "page" : undefined} className={linkClass("overview")}>Overview</Link>
      <Link to="/goals" aria-current={active === "goals" ? "page" : undefined} className={linkClass("goals")}>Goals</Link>
      <Link to="/investments" aria-current={active === "investments" ? "page" : undefined} className={linkClass("investments")}>Investments</Link>
      <Link to="/calculators" aria-current={active === "calculators" ? "page" : undefined} className={linkClass("calculators")}>Calculators</Link>
      <Link to="/pulse" aria-current={active === "news" ? "page" : undefined} className={linkClass("news")}>Pulse</Link>
    </nav>
    <div className="app-navigation__account"><ThemeToggle /><button type="button" className="app-navigation__signout" onClick={() => void signOut()}>Sign out</button></div>
  </header>;
}
