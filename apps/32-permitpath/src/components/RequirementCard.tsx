import Link from "next/link";
import type { Jurisdiction, RequirementRecord } from "@/db/schema";
import { IconExternal } from "@/components/icons";
import { freshness, money, recencyLabel, totalCents } from "@/lib/format";
import { jobTypeLabel } from "@/lib/taxonomy";

/**
 * The requirement card: bond stock, radius 12, padding 16. A label and a mono
 * version tag on top, the facts in the body, and the provenance in the footer —
 * source, verifier, and how old the verification is.
 *
 * The recency stamp is not decoration and is never omitted. A record without a
 * verified-at date is exactly the thing this product exists to replace.
 */
export function RequirementCard({
  record,
  jurisdiction,
  sourceLabel,
  sourceUrl,
  historyHref,
  suggestHref,
}: {
  record: RequirementRecord;
  jurisdiction: Pick<Jurisdiction, "name" | "departmentName">;
  sourceLabel?: string | null;
  sourceUrl?: string | null;
  historyHref?: string;
  suggestHref?: string;
}) {
  const feeTotal = totalCents(record.fees);
  const age = freshness(record.verifiedAt);
  const required = record.submittalRequirements.filter((s) => s.required);
  const conditional = record.submittalRequirements.filter((s) => !s.required);

  return (
    <article className="card">
      <div className="flex items-baseline justify-between gap-3">
        <span className="t-label">{jobTypeLabel(record.jobType)}</span>
        <span className="t-data" style={{ color: "var(--color-fg-3)" }}>
          v{record.version}
        </span>
      </div>

      <p className="t-body mt-3">
        {record.permitsRequired.length === 0
          ? `No permit required for this scope in ${jurisdiction.name}.`
          : `${record.permitsRequired.join(" + ")} required.`}{" "}
        {record.permitsRequired.length > 0 && (
          <>
            Fees{" "}
            <span className="t-mono" style={{ fontSize: 15 }}>
              {money(feeTotal)}
            </span>
            . {record.reviewTimeline}.
          </>
        )}
      </p>

      {required.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1">
          {required.map((item) => (
            <li key={item.title} className="t-secondary">
              <span style={{ color: "var(--color-fg)" }}>{item.title}</span> — {item.detail}
            </li>
          ))}
        </ul>
      )}

      {conditional.length > 0 && (
        <p className="t-secondary mt-3">
          Conditional: {conditional.map((c) => c.title).join(", ")}.
        </p>
      )}

      {record.quirks && (
        <p className="t-secondary mt-3" style={{ color: "var(--color-fg)" }}>
          {record.quirks}
        </p>
      )}

      {record.inspectionContact && (
        <p className="t-secondary mt-3">
          Inspections: {record.inspectionSequence.join(" → ")}. {record.inspectionContact}.
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2 border-t pt-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="t-secondary">
            {sourceUrl ? (
              <a href={sourceUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1">
                {sourceLabel ?? `${jurisdiction.name} ${jurisdiction.departmentName}`}
                <IconExternal size={14} />
              </a>
            ) : (
              (sourceLabel ?? `${jurisdiction.name} ${jurisdiction.departmentName}`)
            )}
          </span>
          <span
            className="t-data"
            style={{
              color:
                age === "fresh"
                  ? "var(--color-fg-3)"
                  : age === "aging"
                    ? "var(--color-ochre)"
                    : "var(--color-signal-red)",
            }}
          >
            {recencyLabel(record.verifiedAt)}
          </span>
        </div>
        <p className="t-secondary">
          Verified by {record.verifiedBy}
          {record.sourceKind === "contribution" ? " from a field contribution" : ""}.
        </p>
        <div className="flex flex-wrap gap-4">
          {historyHref && (
            <Link href={historyHref} className="btn-quiet btn-quiet-sm">
              View change history
            </Link>
          )}
          {suggestHref && (
            <Link href={suggestHref} className="btn-quiet btn-quiet-sm">
              Suggest an edit
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
