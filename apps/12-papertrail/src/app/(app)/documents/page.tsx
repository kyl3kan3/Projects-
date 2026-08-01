import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { DOCUMENT_NOUN, invoicesFor, listDocuments, totalsFor } from "@/lib/documents";
import { describeInvoiceState, refreshOverdue } from "@/lib/invoices";
import { formatMoneyShort } from "@/lib/money";
import { formatShortDate } from "@/lib/dates";
import { SealChip } from "@/components/SealChip";
import { DocTypeIcon, IconPlus } from "@/components/icons";
import type { DocumentType } from "@/db/schema";

export const metadata: Metadata = { title: "Documents" };

const FILTERS: { key: string; label: string; match: (t: DocumentType) => boolean }[] = [
  { key: "all", label: "All", match: () => true },
  { key: "proposal", label: "Proposals", match: (t) => t === "proposal" },
  { key: "contract", label: "Contracts", match: (t) => t === "contract" },
  { key: "invoice", label: "Invoices", match: (t) => t === "invoice" },
];

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type = "all" } = await searchParams;
  const user = await requireUser();
  const now = new Date();

  // Overdue is derived on read, so the list is right even if cron never ran.
  await refreshOverdue(user.id, now);

  const all = await listDocuments(user.id);
  const invoiceRows = await invoicesFor(all.filter((d) => d.type === "invoice").map((d) => d.id));
  const totals = await totalsFor(all.map((d) => d.id));
  const filter = FILTERS.find((f) => f.key === type) ?? FILTERS[0];
  const rows = all.filter((d) => filter.match(d.type));

  return (
    <main className="screen pt-6">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="t-h2">Documents</h1>
        <span className="t-secondary">{all.length} in total</span>
      </div>

      <div className="scroll-x mt-4 flex gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/documents" : `/documents?type=${f.key}`}
            className="chip"
            data-active={f.key === filter.key}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <section className="mt-10">
          <h2 className="t-h2">
            {all.length === 0 ? "Nothing sent yet." : `No ${filter.label.toLowerCase()} yet.`}
          </h2>
          <p className="t-secondary mt-2 max-w-[42ch]">
            {all.length === 0
              ? "Start with a proposal. When your client accepts it, the contract is drafted from the same words and prices — and signing it sends the deposit invoice."
              : "Contracts and invoices appear here as the chain creates them."}
          </p>
          <Link href="/documents/new" className="btn btn-primary btn-full mt-6">
            Write a proposal
          </Link>
        </section>
      ) : (
        <ul className="mt-4 list-none p-0">
          {rows.map((document) => {
            const invoice = invoiceRows.get(document.id);
            const meta = invoice
              ? `${invoice.number} · ${describeInvoiceState(document.status, invoice, now)}`
              : document.sentAt
                ? `${DOCUMENT_NOUN[document.type]} · sent ${formatShortDate(document.sentAt)}`
                : `${DOCUMENT_NOUN[document.type]} · draft`;
            return (
              <li key={document.id}>
                <Link href={`/documents/${document.id}`} className="row">
                  <span style={{ color: "var(--color-text-2)" }} aria-hidden="true">
                    <DocTypeIcon type={document.type} size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="t-title block truncate">{document.title}</span>
                    <span className="t-meta mt-1 block">{meta}</span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className="t-money">
                      {formatMoneyShort(invoice?.total ?? totals.get(document.id) ?? 0, document.currency)}
                    </span>
                    <SealChip type={document.type} status={document.status} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Link href="/documents/new" className="thumb-cta btn btn-primary btn-full">
        <IconPlus size={18} />
        New proposal
      </Link>
    </main>
  );
}
