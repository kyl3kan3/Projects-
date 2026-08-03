import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listContracts } from "@/lib/contracts";
import { CONTRACT_TYPE_LABELS } from "@/lib/taxonomy";
import { FlagSummary } from "@/components/SeverityChip";
import { IconChevronRight, IconPlus, IconUploadDoc } from "@/components/icons";
import { stepLabel } from "@/lib/pipeline";

export const metadata: Metadata = { title: "Contracts" };

function when(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return date.toISOString().slice(0, 10);
}

export default async function ContractsPage() {
  const { account } = await requireUser();
  const rows = await listContracts(account.id);

  return (
    <main className="screen">
      <div className="flex items-baseline justify-between pt-8 pb-2">
        <h1 className="t-h2">Contracts</h1>
        <Link href="/contracts/new" className="btn-quiet">
          <IconPlus size={18} />
          New review
        </Link>
      </div>

      {rows.length === 0 ? (
        <section className="mt-6">
          <div className="card p-6">
            <span style={{ color: "var(--color-oxblood)" }}>
              <IconUploadDoc size={20} />
            </span>
            <h2 className="t-title mt-3">No contracts yet</h2>
            <p className="t-secondary mt-2">
              The first one usually arrives at 6pm with &ldquo;any concerns? hoping to kick
              off Monday.&rdquo; Upload it here and read what it actually says — payment
              terms, IP, indemnity, the auto-renewal window.
            </p>
            <Link href="/contracts/new" className="btn btn-primary mt-5" style={{ width: "100%" }}>
              Review your contract
            </Link>
          </div>
        </section>
      ) : (
        <section className="mt-4">
          {rows.map(({ contract, summary }, i) => (
            <Link
              key={contract.id}
              href={`/contracts/${contract.id}`}
              className="row enter no-underline"
              style={{ animationDelay: `${Math.min(i, 8) * 24}ms`, color: "inherit" }}
            >
              <span className="min-w-0 flex-1">
                <span className="t-title block truncate">{contract.title}</span>
                <span className="t-secondary mt-0.5 block truncate" style={{ color: "var(--color-text-3)" }}>
                  {[
                    CONTRACT_TYPE_LABELS[contract.contractType],
                    contract.counterparty,
                    when(contract.createdAt),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <span className="mt-1.5 block">
                  {contract.status === "ready" && summary ? (
                    <FlagSummary summary={summary} />
                  ) : (
                    <span
                      className="t-data"
                      style={{
                        color:
                          contract.status === "failed"
                            ? "var(--color-oxblood)"
                            : "var(--color-text-3)",
                      }}
                    >
                      {contract.status === "failed"
                        ? "REVIEW FAILED · CREDIT RETURNED"
                        : stepLabel(contract.status).step.toUpperCase()}
                    </span>
                  )}
                </span>
              </span>
              <span style={{ color: "var(--color-text-3)" }}>
                <IconChevronRight size={20} />
              </span>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
