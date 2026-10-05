export function AuthBrandPanel() {
  return (
    <section className="auth-rise auth-rise-1 order-2 lg:order-1">
      <div className="max-w-xl">
        <span className="inline-block text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
          Financial Litter
        </span>
        <h1 className="font-display mt-4 text-[3rem] font-extrabold leading-[0.95] tracking-[-0.03em] sm:text-[3.6rem] lg:text-[4.2rem]">
          Money moves fast.
          <br />
          <span className="text-primary">Read it faster.</span>
        </h1>
        <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted-foreground">
          Financial Litter turns market data, portfolios and news into one clean
          feed — so your next decision takes seconds, not a spreadsheet.
        </p>

        <div className="mt-7 flex flex-wrap gap-2">
          <span className="rounded-full border border-border bg-secondary/40 px-3 py-1.5 text-[12px] font-medium text-foreground/80">
            Live portfolio tracking
          </span>
          <span className="rounded-full border border-border bg-secondary/40 px-3 py-1.5 text-[12px] font-medium text-foreground/80">
            News in plain English
          </span>
          <span className="rounded-full border border-border bg-secondary/40 px-3 py-1.5 text-[12px] font-medium text-foreground/80">
            Risk, decoded
          </span>
        </div>
      </div>
    </section>
  );
}
