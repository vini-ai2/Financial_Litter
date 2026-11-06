import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AuthenticatedShell } from "@/components/authenticated-shell";
import { newsApi, restoreAccessToken } from "@/lib/api";

const categories: Record<string, string> = {
  COMPANY_DEVELOPMENT: "Company development",
  EARNINGS: "Earnings",
  REGULATORY_ACTION: "Regulatory action",
  MARKET_ECONOMIC: "Market and economy",
  CORPORATE_ACTION: "Corporate action",
  RISK: "Risk",
};

const timestamp = (value: string | null) => value
  ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value))
  : "Not provided";

export const Route = createFileRoute("/news/$eventId")({
  head: () => ({ meta: [{ title: "Market event · FinLitter" }] }),
  component: NewsEventPage,
});

function NewsEventPage() {
  const { eventId } = Route.useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    restoreAccessToken().then(async (hasSession) => {
      if (!active) return;
      if (!hasSession) { void navigate({ to: "/login", replace: true }); return; }
      try {
        const result = await newsApi.event(eventId);
        if (active) setEvent(result);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load this market event.");
      } finally { if (active) setLoading(false); }
    }).catch((reason) => {
      if (active) { setError(reason instanceof Error ? reason.message : "Could not connect to the finance service."); setLoading(false); }
    });
    return () => { active = false; };
  }, [eventId, navigate]);

  return (
    <AuthenticatedShell active="news">
      <main className="news-detail">
        <Link className="news-back" to="/news">← Market news</Link>
        {loading && <p className="news-state">Loading event details…</p>}
        {!loading && error && <div className="news-error" role="alert"><p>{error}</p><button className="news-button mt-3" onClick={() => window.location.reload()}>Retry</button></div>}
        {!loading && !error && event && <>
          {event.revisionType === "RETRACTION" && <p className="news-retraction" role="status">Retracted by a later source filing</p>}
          <header className="news-detail__header">
            <p className="news-item__category">{categories[event.category] ?? "Unclassified"} <span aria-hidden="true">·</span> {event.materiality.toLowerCase()} materiality</p>
            <h1>{event.headline}</h1>
            <p className="news-detail__date">{timestamp(event.eventDate)}</p>
          </header>

          <div className="news-detail__grid">
            <div className="news-detail__main">
              <section className="news-detail__section" aria-labelledby="happened-heading">
                <h2 id="happened-heading">What happened</h2>
                <p className="news-detail__summary">{event.whatHappened || "No summary is available. Review the source documents for details."}</p>
              </section>

              <section className="news-detail__section" aria-labelledby="facts-heading">
                <h2 id="facts-heading">Known facts</h2>
                {Array.isArray(event.facts) && event.facts.length ? <ul className="news-facts">{event.facts.map((fact: any, index: number) => <li key={`${fact.field}-${fact.startOffset}-${index}`}>
                  <span>{fact.type.replaceAll("_", " ").toLowerCase()}</span><p>{fact.value}</p>
                </li>)}</ul> : <p className="text-sm text-muted-foreground">No structured facts were extracted.</p>}
              </section>

              <section className="news-detail__section" aria-labelledby="sources-heading">
                <h2 id="sources-heading">Supporting sources</h2>
                {event.supportingSources.length === 0 && <p className="text-sm text-muted-foreground">No source documents are linked to this event.</p>}
                <ol className="news-source-list">{event.supportingSources.map((source: any) => <li key={source.id}>
                  <div className="news-source-list__top"><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a><span>{source.organization}</span></div>
                  <p>Published {timestamp(source.publishedAt)} <span aria-hidden="true">·</span> Retrieved {timestamp(source.retrievedAt)}</p>
                  <p>Content hash <code>{source.contentHash}</code></p>
                </li>)}</ol>
                {event.supportingEvidence?.length > 0 && <div className="news-evidence"><h3>Source passages</h3>{event.supportingEvidence.map((evidence: any, index: number) => <blockquote key={`${evidence.documentId}-${evidence.startOffset}-${index}`}>
                  <p>“{evidence.quote}”</p><footer>{evidence.sourceName} · {evidence.field}</footer>
                </blockquote>)}</div>}
              </section>

              <section className="news-detail__section" aria-labelledby="history-heading">
                <h2 id="history-heading">Revision history</h2>
                {event.revisions.length === 0 && <p className="text-sm text-muted-foreground">No revision history is available.</p>}
                <ol className="news-revisions">{event.revisions.map((revision: any) => <li key={revision.version}>
                  <div className="news-revisions__title"><h3>Version {revision.version}: {revision.type.toLowerCase()}</h3><time>{timestamp(revision.recordedAt)}</time></div>
                  <p>{revision.headline}</p>
                  {revision.summary && <p className="text-muted-foreground">{revision.summary}</p>}
                  <ul className="news-revision-sources">{revision.sources.map((source: any) => <li key={source.id}>
                    <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
                    <span>{source.sourceName} · Published {timestamp(source.publishedAt)} · Retrieved {timestamp(source.retrievedAt)}</span>
                  </li>)}</ul>
                  {revision.evidence.length > 0 && <ul className="news-revision-evidence">{revision.evidence.map((evidence: any, index: number) => <li key={`${evidence.documentId}-${index}`}>“{evidence.quote}” <span>— {evidence.sourceName}</span></li>)}</ul>}
                </li>)}</ol>
              </section>
            </div>

            <aside className="news-detail__aside">
              <section aria-labelledby="entities-heading">
                <h2 id="entities-heading">Relevant entities</h2>
                {event.entities.length ? <ul>{event.entities.map((entity: any) => <li key={entity.id}><span>{entity.name}</span><small>{entity.type.toLowerCase().replaceAll("_", " ")}{entity.jurisdiction ? ` · ${entity.jurisdiction}` : ""}</small></li>)}</ul> : <p>No entities were resolved with confidence.</p>}
              </section>
              <section aria-labelledby="uncertainty-heading">
                <h2 id="uncertainty-heading">Classification and uncertainty</h2>
                <dl>
                  <div><dt>Event type</dt><dd>{categories[event.category] ?? "Unclassified"}</dd></div>
                  <div><dt>Classification confidence</dt><dd>{event.classificationConfidence == null ? "Unavailable" : `${Math.round(event.classificationConfidence * 100)}%`}</dd></div>
                  <div><dt>Materiality</dt><dd>{event.materiality.toLowerCase()}</dd></div>
                  <div><dt>Source status</dt><dd>{event.verificationStatus === "SOURCE_LINKED" ? "Source linked" : "No source linked"}</dd></div>
                </dl>
                <p>{event.verificationNote}</p>
                <p>Classification confidence reflects deterministic category matching, not whether the reported facts are true.</p>
              </section>
            </aside>
          </div>
        </>}
      </main>
    </AuthenticatedShell>
  );
}
