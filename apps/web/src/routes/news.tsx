import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { AuthenticatedShell } from "@/components/authenticated-shell";
import { newsApi, restoreAccessToken, type NewsCategory, type NewsFeedFilters, type NewsPreferences } from "@/lib/api";

const categories: Array<{ value: NewsCategory; label: string }> = [
  { value: "COMPANY_DEVELOPMENT", label: "Company developments" },
  { value: "EARNINGS", label: "Earnings" },
  { value: "REGULATORY_ACTION", label: "Regulatory actions" },
  { value: "MARKET_ECONOMIC", label: "Market and economy" },
  { value: "CORPORATE_ACTION", label: "Corporate actions" },
  { value: "RISK", label: "Risks" },
];

const dateLabel = (value: string | null) => value
  ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(value))
  : "Date unavailable";

const categoryLabel = (value: string | null) => categories.find((category) => category.value === value)?.label ?? "Unclassified";

export const Route = createFileRoute("/news")({
  head: () => ({ meta: [{ title: "News · FinLitter" }, { name: "description", content: "Sourced market events and filings." }] }),
  component: NewsPage,
});

function NewsPage() {
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [options, setOptions] = useState<{ categories: NewsCategory[]; regions: string[] } | null>(null);
  const [preferences, setPreferences] = useState<NewsPreferences>({ categories: [], regions: [] });
  const [filters, setFilters] = useState<NewsFeedFilters>({ page: 1, pageSize: 20 });
  const [pageCount, setPageCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [preferencesError, setPreferencesError] = useState("");
  const [notice, setNotice] = useState("");
  const [savingPreferences, setSavingPreferences] = useState(false);
  const filterForm = useRef<HTMLFormElement>(null);
  const hasActiveFilters = Boolean(filters.category || filters.region || filters.company || filters.from || filters.to);

  const loadEvents = useCallback(async (query: NewsFeedFilters) => {
    setLoading(true);
    setError("");
    try {
      const result = await newsApi.events(query);
      setEvents(result.items);
      setPageCount(result.totalPages);
      setTotal(result.total);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load market news.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    restoreAccessToken().then(async (hasSession) => {
      if (!active) return;
      if (!hasSession) { void navigate({ to: "/login", replace: true }); return; }
      setAuthorized(true);
      try {
        const [filterOptions, savedPreferences] = await Promise.all([newsApi.filters(), newsApi.preferences()]);
        if (!active) return;
        setOptions(filterOptions);
        setPreferences(savedPreferences);
        setPreferencesError("");
      } catch (reason) {
        if (!active) return;
        setPreferencesError(reason instanceof Error ? reason.message : "News settings could not be loaded.");
      }
      if (active) await loadEvents({ page: 1, pageSize: 20 });
    }).catch((reason) => {
      if (!active) return;
      setError(reason instanceof Error ? reason.message : "Could not connect to the finance service.");
      setLoading(false);
    });
    return () => { active = false; };
  }, [loadEvents, navigate]);

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const next: NewsFeedFilters = {
      page: 1,
      pageSize: 20,
      category: (String(values.get("category") ?? "") || undefined) as NewsCategory | undefined,
      region: String(values.get("region") ?? "") || undefined,
      company: String(values.get("company") ?? "") || undefined,
      from: String(values.get("from") ?? "") || undefined,
      to: String(values.get("to") ?? "") || undefined,
    };
    setFilters(next);
    void loadEvents(next);
  }

  function clearFilters() {
    filterForm.current?.reset();
    const next = { page: 1, pageSize: 20 };
    setFilters(next);
    void loadEvents(next);
  }

  async function savePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setSavingPreferences(true);
    setPreferencesError("");
    setNotice("");
    try {
      const updated = await newsApi.savePreferences({
        categories: values.getAll("preferredCategory").map(String) as NewsCategory[],
        regions: values.getAll("preferredRegion").map(String),
      });
      setPreferences(updated);
      setNotice("News preferences saved.");
    } catch (reason) {
      setPreferencesError(reason instanceof Error ? reason.message : "Preferences could not be saved.");
    } finally { setSavingPreferences(false); }
  }

  async function changePage(page: number) {
    const next = { ...filters, page };
    setFilters(next);
    await loadEvents(next);
  }

  if (!authorized) return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading news…</div>;

  return (
    <AuthenticatedShell active="news">
      <div className="news-page">
        <header className="news-header">
          <div>
            <p className="news-kicker">Market</p>
            <h1 className="font-display">News</h1>
            <p className="news-deck">Filings and market events from configured sources.</p>
          </div>
          <details className="news-preferences">
            <summary>Preferences</summary>
            <form onSubmit={(event) => void savePreferences(event)} className="news-preferences__form">
              <p className="text-sm text-muted-foreground">Saved for later news views. The Market feed remains unfiltered.</p>
              <fieldset>
                <legend>Preferred categories</legend>
                <div className="news-check-grid">{categories.map((category) => <label key={category.value}>
                  <input type="checkbox" name="preferredCategory" value={category.value} checked={preferences.categories.includes(category.value)} onChange={(event) => setPreferences((current) => ({ ...current, categories: event.target.checked ? [...current.categories, category.value] : current.categories.filter((value) => value !== category.value) }))} />
                  <span>{category.label}</span>
                </label>)}</div>
              </fieldset>
              <fieldset>
                <legend>Preferred regions</legend>
                {options?.regions.length ? <div className="news-check-grid">{options.regions.map((region) => <label key={region}>
                  <input type="checkbox" name="preferredRegion" value={region} checked={preferences.regions.includes(region)} onChange={(event) => setPreferences((current) => ({ ...current, regions: event.target.checked ? [...current.regions, region] : current.regions.filter((value) => value !== region) }))} />
                  <span>{region}</span>
                </label>)}</div> : <p className="text-sm text-muted-foreground">No source regions are configured yet.</p>}
              </fieldset>
              <button className="news-button news-button--primary" type="submit" disabled={savingPreferences}>{savingPreferences ? "Saving…" : "Save preferences"}</button>
              {notice && <p role="status" className="news-notice">{notice}</p>}
              {preferencesError && <p role="alert" className="news-error">{preferencesError}</p>}
            </form>
          </details>
        </header>

        <form ref={filterForm} className="news-filters" onSubmit={submitFilters}>
          <label><span className="field-label">Category</span><select className="field-input" name="category" defaultValue={filters.category ?? ""}><option value="">All categories</option>{categories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select></label>
          <label><span className="field-label">Region</span><select className="field-input" name="region" defaultValue={filters.region ?? ""}><option value="">All regions</option>{options?.regions.map((region) => <option key={region}>{region}</option>)}</select></label>
          <label><span className="field-label">Company</span><input className="field-input" name="company" placeholder="Company or security" defaultValue={filters.company ?? ""} /></label>
          <label><span className="field-label">From</span><input className="field-input" type="date" name="from" defaultValue={filters.from ?? ""} /></label>
          <label><span className="field-label">To</span><input className="field-input" type="date" name="to" defaultValue={filters.to ?? ""} /></label>
          <div className="news-filter-actions"><button className="news-button news-button--primary" type="submit">Apply</button><button className="news-button" type="button" onClick={clearFilters}>Clear</button></div>
        </form>

        <section aria-label="Market news" aria-live="polite" className="news-feed">
          <div className="news-feed__heading"><h2>Latest events</h2><span>{loading ? "Updating…" : `${total} ${total === 1 ? "event" : "events"}`}</span></div>
          {error && <div className="news-error" role="alert"><p>{error}</p><button className="news-button mt-3" onClick={() => void loadEvents(filters)}>Retry</button></div>}
          {loading && !error && <p className="news-state">Loading market events…</p>}
          {!loading && !error && events.length === 0 && <div className="news-empty"><h3>{hasActiveFilters ? "No events match these filters" : "No market events yet"}</h3><p>{hasActiveFilters ? "Try a broader date range or clear one or more filters." : "Events will appear when sourced documents have been ingested and processed."}</p></div>}
          {!loading && !error && events.length > 0 && <ol className="news-list">{events.map((item) => <li key={item.id}>
            <article>
              <p className="news-date">{dateLabel(item.eventDate)}</p>
              <div className="news-item__body">
                <p className="news-item__category">{categoryLabel(item.category)} <span aria-hidden="true">·</span> {item.materiality.toLowerCase()} materiality</p>
                <h3><Link to="/news/$eventId" params={{ eventId: item.id }}>{item.headline}</Link></h3>
                <p className="news-item__summary">{item.summary}</p>
                <div className="news-item__meta">
                  {item.entities.length > 0 && <span>{item.entities.map((entity: { name: string }) => entity.name).join(", ")}</span>}
                  <span>{item.verificationStatus === "SOURCE_LINKED" ? `${item.sourceCount} source ${item.sourceCount === 1 ? "document" : "documents"} linked` : "No source document linked"}</span>
                </div>
              </div>
              <Link className="news-item__open" to="/news/$eventId" params={{ eventId: item.id }} aria-label={`Read source and revision details for ${item.headline}`}>Details <span aria-hidden="true">↗</span></Link>
            </article>
          </li>)}</ol>}
          {!loading && !error && pageCount > 1 && <nav className="news-pagination" aria-label="News pages">
            <button className="news-button" disabled={filters.page === 1} onClick={() => void changePage(filters.page! - 1)}>Previous</button>
            <span>Page {filters.page} of {pageCount}</span>
            <button className="news-button" disabled={filters.page === pageCount} onClick={() => void changePage(filters.page! + 1)}>Next</button>
          </nav>}
        </section>
      </div>
    </AuthenticatedShell>
  );
}
