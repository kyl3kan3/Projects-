import type { Metadata } from "next";
import Link from "next/link";
import { requirePractice } from "@/lib/auth";
import { AUDIT_VERB, listAuditEvents, type AuditFilter } from "@/lib/audit";
import { dueSoonCount } from "@/lib/retention";
import { asrConfigured, llmConfigured, storageConfigured } from "@/lib/env";
import { formatDate, formatStamp } from "@/lib/format";
import { TrustControls } from "./TrustControls";
import { IconDownload, IconEyeLog, IconFlameOut } from "@/components/icons";

export const metadata: Metadata = { title: "Trust" };
export const dynamic = "force-dynamic";

const FILTERS: { key: AuditFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "views", label: "Views" },
  { key: "edits", label: "Edits" },
  { key: "signs", label: "Signs" },
  { key: "exports", label: "Exports" },
  { key: "purges", label: "Purges" },
];

/**
 * Trust. BAA state, the retention control, the audit log, and the exports — the
 * screen designed with the same care as Today, because it is the one that closes
 * sales and the one an auditor would be shown.
 *
 * The provider panel tells the truth about this install rather than about the
 * marketing site: which services are configured, and what runs when they are not.
 */
export default async function TrustPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { practice } = await requirePractice();
  const params = await searchParams;
  const filter = (FILTERS.find((f) => f.key === params.filter)?.key ??
    "all") as AuditFilter;

  const [events, dueSoon] = await Promise.all([
    listAuditEvents({ practiceId: practice.id, filter, limit: 80 }),
    dueSoonCount(practice.id),
  ]);

  return (
    <main className="screen pt-6">
      <h1 className="t-h2 mb-1">Trust</h1>
      <p className="t-secondary mb-6">
        What this install does with clinical data, and every action taken in it.
      </p>

      <section className="panel mb-5 p-4">
        <h2 className="t-label mb-3">Posture</h2>
        <dl className="grid gap-3 md:grid-cols-2">
          <Fact
            label="BAA accepted"
            value={
              practice.baaAcceptedAt
                ? formatDate(practice.baaAcceptedAt, practice.timezone)
                : "not accepted"
            }
          />
          <Fact label="Retention window" value={`${practice.retentionDays} days`} />
          <Fact
            label="Purging within 24h"
            value={`${dueSoon} artifact${dueSoon === 1 ? "" : "s"}`}
          />
          <Fact
            label="Transcription"
            value={asrConfigured() ? "Deepgram (BAA required)" : "built-in fixture"}
          />
          <Fact
            label="Drafting"
            value={llmConfigured() ? "Anthropic (BAA required)" : "built-in extractive"}
          />
          <Fact
            label="Audio storage"
            value={storageConfigured() ? "Cloudflare R2" : "Postgres (this install)"}
          />
        </dl>
        {(!asrConfigured() || !llmConfigured()) && (
          <p className="t-secondary mt-3" style={{ color: "var(--color-amber-text)" }}>
            One or more providers are not configured, so this install runs its built-in
            fixture pipeline. Every transcript and draft it produces is labelled as a
            fixture wherever it appears.
          </p>
        )}
      </section>

      <section className="mb-6">
        <h2 className="t-label mb-3">Retention</h2>
        <TrustControls retentionDays={practice.retentionDays} />
      </section>

      <section className="mb-6">
        <h2 className="t-label mb-3">Exports</h2>
        <div className="panel p-4">
          <p className="t-secondary mb-3">
            Signed notes export as PDF with their signature chain and content hashes.
            The audit log exports as CSV and contains no clinical content by
            construction.
          </p>
          {/*
            Plain anchors, not next/link: a Link to a route handler gets
            prefetched, which ran the export and wrote an `exported` audit event
            for a clinician who had only opened this screen. In an audit-grade
            product a phantom export row is worse than a slow click.
          */}
          <div className="flex flex-wrap gap-4">
            <a className="btn-quiet btn-quiet-sm" href="/api/exports/range" download>
              <span className="inline-flex items-center gap-1">
                <IconDownload size={16} /> Signed notes, last 90 days (PDF)
              </span>
            </a>
            <a className="btn-quiet btn-quiet-sm" href="/api/exports/audit.csv" download>
              <span className="inline-flex items-center gap-1">
                <IconDownload size={16} /> Audit log (CSV)
              </span>
            </a>
          </div>
        </div>
      </section>

      <section>
        <h2 className="t-label mb-3">Audit log</h2>
        <div className="chip-row mb-3">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              className="chip"
              data-active={f.key === filter}
              href={`/trust?filter=${f.key}`}
            >
              {f.label}
            </Link>
          ))}
        </div>

        {events.length === 0 ? (
          <p className="t-secondary py-2">No events of that kind yet.</p>
        ) : (
          <div className="scroll-x">
            {events.map((event) => (
              <div key={event.id} className="ledger-row">
                <span>{formatStamp(event.occurredAt, practice.timezone)}</span>
                <span className="ledger-verb">
                  <span className="inline-flex items-center gap-1">
                    {event.action === "purged" ? (
                      <span style={{ color: "var(--color-ink-3)" }}>
                        <IconFlameOut size={14} />
                      </span>
                    ) : (
                      <span style={{ color: "var(--color-ink-3)" }}>
                        <IconEyeLog size={14} />
                      </span>
                    )}
                    {AUDIT_VERB[event.action as keyof typeof AUDIT_VERB] ??
                      event.action.toUpperCase()}
                  </span>
                </span>
                <span>{event.targetKind}</span>
                <span>{event.actorKind === "system" ? "system" : "you"}</span>
                <span>{event.ip ?? "ip not recorded"}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="t-label">{label}</dt>
      <dd className="t-data mt-1">{value}</dd>
    </div>
  );
}
