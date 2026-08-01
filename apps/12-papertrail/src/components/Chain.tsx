import Link from "next/link";
import { SealChip } from "@/components/SealChip";
import { DocTypeIcon } from "@/components/icons";
import { DOCUMENT_NOUN } from "@/lib/documents";
import { formatShortDate } from "@/lib/dates";
import { describeInvoiceState } from "@/lib/invoices";
import { formatMoneyShort } from "@/lib/money";
import type { ChainNode } from "@/lib/chain";

/**
 * The chain thread: document cards stitched onto a vertical line 16px from the
 * gutter. Spans up to the last completed node are solid ink; everything past it
 * is dashed 4/4 in text-3 — the future, honestly drawn as not-yet.
 *
 * Plain CSS and transforms only, so it runs at 60fps on a phone and collapses to
 * final states under prefers-reduced-motion.
 */

export function ChainThread({
  nodes,
  now,
  /** The document whose status just changed, if known — its node stitches in. */
  justChangedId,
}: {
  nodes: ChainNode[];
  now: Date;
  justChangedId?: string;
}) {
  const lastComplete = lastCompleteIndex(nodes);

  return (
    <ol className="thread m-0 list-none p-0">
      {nodes.map((node, i) => {
        const future = i > lastComplete;
        const first = i === 0;
        const last = i === nodes.length - 1;
        return (
          <li key={node.document.id} className="relative pb-4 last:pb-0">
            {/* The rail behind this card. Stops at the node on the last card. */}
            <span
              aria-hidden="true"
              className="absolute w-[2px]"
              style={{
                left: -21,
                top: first ? 22 : 0,
                height: last ? (first ? 0 : 22) : "100%",
                background: future
                  ? "repeating-linear-gradient(to bottom, var(--color-text-3) 0 4px, transparent 4px 8px)"
                  : "var(--color-ink)",
              }}
            />
            <span
              aria-hidden="true"
              className={`thread-node${node.document.id === justChangedId ? " thread-stitch" : ""}`}
              style={{ top: 22, left: -24 }}
              data-future={future}
            />
            <ChainCard node={node} now={now} stitched={node.document.id === justChangedId} />
          </li>
        );
      })}
    </ol>
  );
}

/** Where the solid thread stops: the last node the client has acted on. */
export function lastCompleteIndex(nodes: ChainNode[]): number {
  let last = -1;
  nodes.forEach((node, i) => {
    const s = node.document.status;
    if (s === "accepted" || s === "signed" || s === "paid") last = i;
  });
  return last;
}

export function ChainCard({
  node,
  now,
  stitched = false,
}: {
  node: ChainNode;
  now: Date;
  stitched?: boolean;
}) {
  const { document, invoice, total } = node;
  const meta = invoice
    ? `${invoice.number} · ${describeInvoiceState(document.status, invoice, now)}`
    : document.sentAt
      ? `Sent ${formatShortDate(document.sentAt)}`
      : "Not sent yet";

  return (
    <Link
      href={`/documents/${document.id}`}
      className={`paper flex items-start gap-3 no-underline${stitched ? " card-stitch" : ""}`}
      style={{ color: "inherit" }}
    >
      <span className="mt-[3px]" style={{ color: "var(--color-text-2)" }} aria-hidden="true">
        <DocTypeIcon type={document.type} size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="t-label block">{DOCUMENT_NOUN[document.type]}</span>
        <span
          className="mt-1 block truncate"
          style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 17 }}
        >
          {document.title}
        </span>
        <span className="t-doc-money mt-2 block">{formatMoneyShort(total, document.currency)}</span>
        <span className="t-meta mt-1 block">{meta}</span>
      </span>
      <SealChip type={document.type} status={document.status} pressed={stitched} />
    </Link>
  );
}
