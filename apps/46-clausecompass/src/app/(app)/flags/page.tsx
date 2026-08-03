import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listFlags } from "@/lib/contracts";
import { CLAUSE_LABELS } from "@/lib/taxonomy";
import { SeverityChip } from "@/components/SeverityChip";
import { IconChevronRight, IconFlagSmall } from "@/components/icons";

export const metadata: Metadata = { title: "Flags" };

/**
 * Every flag the account has ever raised, worst first — the clause library across
 * contracts, in the form that is useful before signing the next one ("every indemnity I
 * have accepted").
 */
export default async function FlagsPage() {
  const { account } = await requireUser();
  const rows = await listFlags(account.id);

  const high = rows.filter((r) => r.flag.severity === "high").length;
  const caution = rows.filter((r) => r.flag.severity === "caution").length;

  return (
    <main className="screen">
      <h1 className="t-h2 pt-8">Flags</h1>
      {rows.length === 0 ? (
        <div className="card mt-6 p-6">
          <span style={{ color: "var(--color-oxblood)" }}>
            <IconFlagSmall size={20} />
          </span>
          <h2 className="t-title mt-3">No flags yet</h2>
          <p className="t-secondary mt-2">
            Flags appear here after your first review. They are the clauses your playbook
            questions — payment terms past net-30, IP that transfers before you are paid, an
            indemnity that runs one way.
          </p>
          <Link href="/contracts/new" className="btn btn-primary mt-5" style={{ width: "100%" }}>
            Review your contract
          </Link>
        </div>
      ) : (
        <>
          <p className="t-data mt-2" style={{ color: "var(--color-text-2)" }}>
            {high} HIGH · {caution} CAUTION · ACROSS {new Set(rows.map((r) => r.contract.id)).size}{" "}
            CONTRACTS
          </p>
          <section className="mt-4">
            {rows.map(({ flag, contract }, i) => (
              <Link
                key={flag.id}
                href={`/contracts/${contract.id}`}
                className="row enter no-underline"
                style={{ animationDelay: `${Math.min(i, 8) * 24}ms`, color: "inherit" }}
              >
                <span className="min-w-0 flex-1">
                  <span className="t-title block">{flag.title}</span>
                  <span className="t-secondary block truncate">
                    {CLAUSE_LABELS[flag.clauseType]} · {contract.title}
                  </span>
                  <span
                    className="t-secondary mt-0.5 block truncate"
                    style={{ color: "var(--color-text-3)" }}
                  >
                    {flag.firedBecause}
                  </span>
                </span>
                <SeverityChip severity={flag.severity} />
                <span style={{ color: "var(--color-text-3)" }}>
                  <IconChevronRight size={20} />
                </span>
              </Link>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
