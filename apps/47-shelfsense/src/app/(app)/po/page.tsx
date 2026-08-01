import type { Metadata } from "next";
import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { suppliers as suppliersTable, variants as variantsTable } from "@/db/schema";
import { requireShop } from "@/lib/auth";
import { billingState, trialActive } from "@/lib/billing";
import { shortDateWithYear } from "@/lib/dates";
import { moneyExact } from "@/lib/format";
import { entitlementsFor } from "@/lib/plans";
import { validateDraft } from "@/lib/po";
import { draftHistory, openDrafts, reorderBoard } from "@/lib/views";
import { BuildDraftsButton } from "./BuildButton";
import { DraftCard, type DraftLineView } from "./DraftCard";

export const metadata: Metadata = { title: "PO drafts" };
export const dynamic = "force-dynamic";

/**
 * PO drafts, one card per supplier, and sent drafts collapsed to hairline history
 * rows — DESIGN.md's "PO drafts" screen.
 */
export default async function PoPage() {
  const { shop } = await requireShop();
  const entitlements = entitlementsFor(shop.plan, trialActive(shop));
  const billing = billingState(shop);

  if (!entitlements.poDrafts) {
    return (
      <main className="screen">
        <header className="pt-8 pb-6">
          <h1 className="t-h2">PO drafts</h1>
        </header>
        <section className="panel p-5">
          <p className="t-title">PO drafts are part of Backroom.</p>
          <p className="t-secondary mt-2">
            Your {billing.planName} plan covers velocity, reorder points, stockout alerts and the
            dead-stock report. Backroom adds supplier profiles with real lead times and
            supplier-grouped POs that honour MOQ and pack size.
          </p>
          <Link href="/settings/billing" className="btn btn-primary btn-full mt-4">
            See plans
          </Link>
        </section>
      </main>
    );
  }

  const board = await reorderBoard(shop.id);
  const drafts = await openDrafts(shop.id);
  const history = await draftHistory(shop.id);
  const pending = board.totals.orderNow + board.totals.orderSoon;

  const db = getDb();
  const supplierRows = await db
    .select()
    .from(suppliersTable)
    .where(eq(suppliersTable.shopId, shop.id));
  const supplierById = new Map(supplierRows.map((s) => [s.id, s]));

  const allVariantIds = drafts.flatMap((d) => d.lines.map((l) => l.variantId));
  const rules = new Map<string, { moq: number; packSize: number }>();
  if (allVariantIds.length) {
    const variantRows = await db
      .select({
        id: variantsTable.id,
        moq: variantsTable.moq,
        packSize: variantsTable.packSize,
      })
      .from(variantsTable)
      .where(inArray(variantsTable.id, allVariantIds));
    for (const row of variantRows) rules.set(row.id, { moq: row.moq, packSize: row.packSize });
  }

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <h1 className="t-h2">PO drafts</h1>
        <p className="t-data mt-2" style={{ color: "var(--color-fg-2)" }}>
          {drafts.length} OPEN · {pending} SKU{pending === 1 ? "" : "S"} DUE
        </p>
      </header>

      <BuildDraftsButton
        label={drafts.length ? "Refresh drafts from the latest run" : `Draft POs (${pending} SKUs)`}
      />

      {drafts.length === 0 ? (
        <section className="panel mt-6 p-5">
          <p className="t-title">No open drafts.</p>
          <p className="t-secondary mt-2">
            {pending > 0
              ? `${pending} SKU${pending === 1 ? " is" : "s are"} at or past their reorder point. Drafting groups them by supplier and rounds each quantity up to that supplier's MOQ and pack size.`
              : "Nothing is at its reorder point, so there is nothing to order. When something crosses, it appears here grouped by supplier."}
          </p>
        </section>
      ) : (
        <div className="mt-6 flex flex-col gap-5">
          {drafts.map(({ draft, lines }) => {
            const supplier = draft.supplierId ? (supplierById.get(draft.supplierId) ?? null) : null;
            const validation = validateDraft({ draft, lines, supplier, variantRules: rules });
            const view: DraftLineView[] = lines.map((line) => ({
              id: line.id,
              sku: line.sku,
              title: line.title,
              suggestedQty: line.suggestedQty,
              finalQty: line.finalQty,
              unitCostCents: line.unitCostCents,
              moq: rules.get(line.variantId)?.moq ?? 0,
              packSize: rules.get(line.variantId)?.packSize ?? 1,
            }));
            return (
              <DraftCard
                key={draft.id}
                draftId={draft.id}
                supplierName={draft.supplierName}
                supplierEmail={supplier?.email ?? null}
                leadTimeDays={draft.leadTimeDays}
                minOrderValueCents={supplier?.minOrderValueCents ?? 0}
                lines={view}
                totalLabel={moneyExact(draft.totalCents, shop.currency)}
                warnings={validation.warnings}
                errors={validation.errors}
                csvHref={`/api/po/${draft.id}/csv`}
                currency={shop.currency}
              />
            );
          })}
        </div>
      )}

      {history.length ? (
        <section className="mt-10">
          <h2 className="t-label mb-2">History</h2>
          {history.map((draft) => (
            <div key={draft.id} className="hairline-b flex items-baseline justify-between py-3">
              <span className="t-data" style={{ color: "var(--color-fg-2)" }}>
                {draft.status === "sent" ? "SENT" : "DISMISSED"}{" "}
                {shortDateWithYear(
                  (draft.sentAt ?? draft.dismissedAt ?? draft.createdAt).toISOString().slice(0, 10),
                )}{" "}
                · {draft.supplierName}
              </span>
              <span className="t-data">
                {draft.lineCount} LINE{draft.lineCount === 1 ? "" : "S"} ·{" "}
                {moneyExact(draft.totalCents, shop.currency)}
              </span>
            </div>
          ))}
        </section>
      ) : null}
    </main>
  );
}
