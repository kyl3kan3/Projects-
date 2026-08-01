import { formatDocumentDate } from "@/lib/dates";
import { billableLines, formatMoney, formatTaxPercent, lineTotal } from "@/lib/money";
import { auditLines } from "@/lib/esign";
import type { BlockContent, Brand, Client, DocBlock, DocumentRow, Invoice, LineItem, Signature } from "@/db/schema";
import type { Totals } from "@/lib/money";

/**
 * The document itself, as a sheet of paper.
 *
 * One renderer for both the freelancer's preview and the client-facing page —
 * ARCHITECTURE.md's "one template renders both" rule, minus the PDF worker (see
 * README setup notes): the same markup prints, so the printed copy cannot drift
 * from the web copy.
 */

export function DocSheet({
  document,
  client,
  brand,
  blocks,
  totals,
  invoice,
  signature,
  badge,
  /** Replaces the pricing table with an interactive one during acceptance. */
  pricingSlot,
  children,
}: {
  document: DocumentRow;
  client: Client;
  brand: Brand | null;
  blocks: DocBlock[];
  totals: Totals;
  invoice?: Invoice | null;
  signature?: Signature | null;
  badge: boolean;
  pricingSlot?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const accent = brand?.accentColor?.match(/^#[0-9a-fA-F]{6}$/)
    ? brand.accentColor
    : "var(--color-ink)";
  const issued = invoice?.issuedAt ?? document.sentAt ?? document.createdAt;

  return (
    <article className="doc-sheet">
      <header>
        <div className="doc-rule" style={{ background: accent }} />
        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <div
              style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 18 }}
            >
              {brand?.name ?? "PaperTrail"}
            </div>
            {brand?.businessDetails ? (
              <p className="t-secondary mt-1 whitespace-pre-line">{brand.businessDetails}</p>
            ) : null}
          </div>
          {brand?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logoUrl}
              alt={`${brand.name} logo`}
              style={{ maxHeight: 40, maxWidth: 120, objectFit: "contain" }}
            />
          ) : null}
        </div>

        <h1 className="t-display mt-6">{document.title}</h1>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
          <div>
            <dt className="t-label">Prepared for</dt>
            <dd className="t-doc mt-1">
              {client.company ? `${client.company} — ${client.name}` : client.name}
            </dd>
          </div>
          <div>
            <dt className="t-label">{invoice ? "Issued" : "Dated"}</dt>
            <dd className="t-doc mt-1">{formatDocumentDate(issued)}</dd>
          </div>
          {invoice ? (
            <>
              <div>
                <dt className="t-label">Invoice</dt>
                <dd className="t-doc mt-1">{invoice.number}</dd>
              </div>
              <div>
                <dt className="t-label">Due</dt>
                <dd className="t-doc mt-1">
                  {invoice.dueAt ? formatDocumentDate(invoice.dueAt) : "On receipt"}
                </dd>
              </div>
            </>
          ) : null}
        </dl>
      </header>

      <div className="mt-8 flex flex-col gap-6">
        {blocks.map((block) => (
          <Block
            key={block.id}
            content={block.content}
            document={document}
            totals={totals}
            pricingSlot={pricingSlot}
            signature={signature ?? null}
          />
        ))}
      </div>

      {children}

      {badge ? (
        <p className="t-secondary hairline-t mt-8 pt-4">
          Sent with PaperTrail — one thread from proposal to paid.
        </p>
      ) : null}
    </article>
  );
}

function Block({
  content,
  document,
  totals,
  pricingSlot,
  signature,
}: {
  content: BlockContent;
  document: DocumentRow;
  totals: Totals;
  pricingSlot?: React.ReactNode;
  signature: Signature | null;
}) {
  if (content.kind === "heading") {
    return <h2 className="t-h2">{content.text}</h2>;
  }
  if (content.kind === "text") {
    return <p className="t-doc whitespace-pre-line">{content.body}</p>;
  }
  if (content.kind === "pricing_table") {
    if (pricingSlot) return <>{pricingSlot}</>;
    return <PricingTable caption={content.caption} lines={content.lines} document={document} totals={totals} />;
  }
  if (content.kind === "terms") {
    return (
      <section>
        <h2 className="t-h2">Terms</h2>
        <div className="mt-3 flex flex-col gap-4">
          {content.clauses.map((clause, i) => (
            <div key={`${clause.heading}-${i}`}>
              <h3 className="t-label">{clause.heading}</h3>
              <p className="t-doc mt-1 whitespace-pre-line">{clause.body}</p>
            </div>
          ))}
        </div>
      </section>
    );
  }
  return <SignatureBlock label={content.label} signature={signature} />;
}

/** The priced scope. Optional rows are marked as add-ons and excluded until taken. */
export function PricingTable({
  caption,
  lines,
  document,
  totals,
}: {
  caption: string;
  lines: LineItem[];
  document: DocumentRow;
  totals: Totals;
}) {
  const shown = lines.filter((l) => !l.optional || l.selected);
  const declined = lines.filter((l) => l.optional && !l.selected);

  return (
    <section>
      <h2 className="t-h2">{caption || "Fees"}</h2>
      <table className="mt-3 w-full border-collapse">
        <tbody>
          {shown.map((line) => (
            <tr key={line.id} className="hairline-b">
              <td className="t-doc py-3 pr-3 align-top">
                {line.description}
                {line.quantity !== 1 ? (
                  <span className="t-meta mt-1 block">
                    {line.quantity} × {formatMoney(line.unitAmount, document.currency)}
                  </span>
                ) : null}
              </td>
              <td className="t-doc-money py-3 text-right align-top whitespace-nowrap">
                {formatMoney(lineTotal(line), document.currency)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {totals.tax > 0 ? (
            <>
              <tr>
                <td className="t-secondary pt-3">Subtotal</td>
                <td className="t-doc-money pt-3 text-right whitespace-nowrap">
                  {formatMoney(totals.subtotal, document.currency)}
                </td>
              </tr>
              <tr>
                <td className="t-secondary pt-1">
                  {document.taxLabel} {formatTaxPercent(document.taxRateBps)}
                </td>
                <td className="t-doc-money pt-1 text-right whitespace-nowrap">
                  {formatMoney(totals.tax, document.currency)}
                </td>
              </tr>
            </>
          ) : null}
          <tr>
            <td className="t-label pt-4">Total</td>
            <td className="t-doc-money pt-4 text-right whitespace-nowrap" style={{ fontSize: 22 }}>
              {formatMoney(totals.total, document.currency)}
            </td>
          </tr>
        </tfoot>
      </table>

      {declined.length ? (
        <p className="t-secondary mt-3">
          Not included: {declined.map((l) => l.description).join(", ")}.
        </p>
      ) : null}
      {billableLines(lines).length === 0 ? (
        <p className="t-secondary mt-3">No priced items yet.</p>
      ) : null}
    </section>
  );
}

/** The signature area: empty on an unsigned contract, the record once signed. */
export function SignatureBlock({
  label,
  signature,
  replay = false,
}: {
  label: string;
  signature: Signature | null;
  /** Replay the drawn stroke once — used right after signing. */
  replay?: boolean;
}) {
  if (!signature) {
    return (
      <section>
        <h2 className="t-label">{label}</h2>
        <div
          className="mt-3"
          style={{ borderBottom: "1px solid var(--color-hairline)", height: 56 }}
        />
        <p className="t-secondary mt-2">To be signed electronically.</p>
      </section>
    );
  }

  const lines = auditLines(signature);
  return (
    <section>
      <h2 className="t-label">{label}</h2>
      <div className="mt-3" style={{ borderBottom: "1px solid var(--color-ink)", paddingBottom: 8 }}>
        {signature.method === "drawn" ? (
          <svg
            viewBox="0 0 600 200"
            className={replay ? "sig-replay" : undefined}
            style={{ width: "100%", maxWidth: 300, height: 100 }}
            role="img"
            aria-label={`Signature of ${signature.signerName}`}
          >
            <path
              d={signature.signatureData}
              fill="none"
              stroke="var(--color-ink)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 28,
              fontStyle: "italic",
              lineHeight: 1.4,
            }}
          >
            {signature.signatureData}
          </span>
        )}
      </div>
      <ul className="mt-3 list-none p-0">
        {lines.map((line, i) => (
          <li
            key={line}
            className="t-meta audit-line"
            style={{ animationDelay: replay ? `${600 + i * 60}ms` : "0ms" }}
          >
            {line}
          </li>
        ))}
      </ul>
    </section>
  );
}
