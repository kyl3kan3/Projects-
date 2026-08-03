import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listRedlines } from "@/lib/contracts";
import { CLAUSE_LABELS } from "@/lib/taxonomy";
import { SeverityChip } from "@/components/SeverityChip";
import { CopyLine } from "@/components/CopyLine";
import { IconStrikePen } from "@/components/icons";

export const metadata: Metadata = { title: "Redlines" };

/**
 * Every suggested redline across the account: a paste-ready library of the language this
 * playbook asks for, which is what someone reaches for while writing the reply rather than
 * while reading the report.
 */
export default async function RedlinesPage() {
  const { account } = await requireUser();
  const rows = await listRedlines(account.id);

  return (
    <main className="screen">
      <h1 className="t-h2 pt-8">Redlines</h1>
      {rows.length === 0 ? (
        <div className="card mt-6 p-6">
          <span style={{ color: "var(--color-oxblood)" }}>
            <IconStrikePen size={20} />
          </span>
          <h2 className="t-title mt-3">No redlines yet</h2>
          <p className="t-secondary mt-2">
            Each flag comes with replacement language written to be pasted into an email.
            They collect here so the wording is to hand next time the same clause turns up.
          </p>
          <Link href="/contracts/new" className="btn btn-primary mt-5" style={{ width: "100%" }}>
            Review your contract
          </Link>
        </div>
      ) : (
        <section className="mt-4">
          {rows.map(({ redline, flag, contract }, i) => (
            <article
              key={redline.id}
              className="hairline-b enter py-5"
              style={{ animationDelay: `${Math.min(i, 8) * 24}ms` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="t-title">{CLAUSE_LABELS[flag.clauseType]}</p>
                  <p className="t-secondary truncate">
                    <Link
                      href={`/contracts/${contract.id}`}
                      className="btn-quiet btn-quiet-sm"
                      style={{ display: "inline" }}
                    >
                      {contract.title}
                    </Link>
                  </p>
                </div>
                <SeverityChip severity={flag.severity} />
              </div>
              {redline.originalPhrase && (
                <p className="mt-3">
                  <span className="redline-original strike-wrap">
                    <span>{redline.originalPhrase}</span>
                    <span className="strike-over" data-drawn="true" aria-hidden="true">
                      {redline.originalPhrase}
                    </span>
                  </span>
                </p>
              )}
              <p className="redline-suggested mt-3">{redline.suggestedText}</p>
              <p className="t-secondary mt-2">{redline.rationale}</p>
              <div className="mt-3">
                <CopyLine text={redline.suggestedText} label="Copy the wording" />
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
