import type { ReactNode } from "react";

export function PageIntro({ eyebrow, title, description, actions }: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return <header className="product-page-intro">
    <div className="min-w-0">
      {eyebrow && <p className="product-eyebrow">{eyebrow}</p>}
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
    {actions && <div className="product-page-intro__actions">{actions}</div>}
  </header>;
}

export function MetricCard({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return <div className="product-metric-card">
    <p className="product-metric-card__label">{label}</p>
    <p className="product-metric-card__value">{value}</p>
    {detail && <p className="product-metric-card__detail">{detail}</p>}
  </div>;
}

export function StatePanel({ tone = "neutral", title, children, action }: {
  tone?: "neutral" | "success" | "warning" | "error";
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return <div className={`product-state product-state--${tone}`} role={tone === "error" ? "alert" : "status"}>
    {title && <p className="product-state__title">{title}</p>}
    <div className="product-state__body">{children}</div>
    {action && <div className="product-state__action">{action}</div>}
  </div>;
}
