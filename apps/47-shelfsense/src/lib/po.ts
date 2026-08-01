/**
 * Purchase-order drafts: group by supplier, round to what the supplier will
 * accept, render the CSV, send the email.
 *
 * The PO is the artefact the merchant actually needs — an alert tells them
 * something is wrong, a PO is the thing that fixes it — so the formatting is a
 * feature, not plumbing. Two details that look fussy and are not:
 *
 *  - The CSV carries a UTF-8 BOM. Without it Excel on Windows opens `Ø` where a
 *    currency symbol or an accented product name should be, and a supplier who
 *    cannot read the SKU column does not ship the order.
 *  - Quantities round **up** to MOQ and then to whole packs. Rounding down is a PO
 *    the supplier rejects, which costs the whole lead time.
 *
 * Suppression is pinned to a fixed distance from the send — `suppressUntil =
 * now + lead time` — rather than to "while the PO is outstanding". A condition that
 * stays true forever is how a SKU vanishes from the reorder list permanently.
 */

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { poDraftLines, poDrafts, suppliers, variants, type PoDraft, type Shop } from "@/db/schema";
import { shortDate, todayInZone } from "@/lib/dates";
import { sendEmail, emailButton, emailShell, escapeHtml } from "@/lib/email";
import { env } from "@/lib/env";
import { NotFoundError, PlanLimitError, ValidationError } from "@/lib/errors";
import { moneyExact } from "@/lib/format";
import { entitlementsFor } from "@/lib/plans";
import {
  csvFilename,
  lineUnitCost,
  renderCsv,
  validateDraft,
  validateLine,
  type DraftValidation,
  type LineValidation,
} from "@/lib/po-format";
import { roundToOrderable } from "@/lib/reorder";
import { reorderBoard, suppressedVariantIds, type SkuRow } from "@/lib/views";
import { trialActive } from "@/lib/billing";

export interface DraftSummary {
  draftId: string;
  supplierId: string | null;
  supplierName: string;
  lineCount: number;
  totalCents: number;
  created: boolean;
}

export interface BuildDraftsResult {
  drafts: DraftSummary[];
  /** SKUs left out because a PO for them was sent or dismissed recently. */
  suppressed: number;
  /** SKUs that need ordering but have no supplier on file. */
  unassigned: number;
}

/**
 * Build (or refresh) one draft per supplier from the current reorder board.
 *
 * Refresh rather than replace: a merchant who edited a quantity to 200 keeps that
 * 200 when the nightly run nudges the suggestion to 192. The suggestion column
 * updates so the difference stays visible; `final_qty` is theirs.
 */
export async function buildDrafts(shop: Shop): Promise<BuildDraftsResult> {
  const entitlements = entitlementsFor(shop.plan, trialActive(shop));
  if (!entitlements.poDrafts) {
    throw new PlanLimitError(
      `PO drafts are part of ${entitlementsFor("backroom", false).name}. Your plan covers velocity, reorder points and dead stock.`,
      "backroom",
    );
  }

  const db = getDb();
  const board = await reorderBoard(shop.id);
  const suppressed = await suppressedVariantIds(shop.id);
  const now = new Date();

  const eligible = board.rows.filter(
    (row) =>
      (row.status === "order_now" || row.status === "order_soon") &&
      row.reorderQty > 0 &&
      !(row.snoozedUntil !== null && row.snoozedUntil > now) &&
      !suppressed.has(row.variantId),
  );

  const skippedSuppressed = board.rows.filter(
    (row) =>
      (row.status === "order_now" || row.status === "order_soon") && suppressed.has(row.variantId),
  ).length;

  const unassigned = eligible.filter((row) => row.supplierId === null).length;

  // Grouped by supplier. Variants with no supplier are grouped together rather
  // than dropped: "four SKUs need ordering and I do not know from whom" is
  // information, and silently omitting them is how a stockout gets missed.
  const groups = new Map<string, SkuRow[]>();
  for (const row of eligible) {
    const key = row.supplierId ?? "unassigned";
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const supplierRows = await db.select().from(suppliers).where(eq(suppliers.shopId, shop.id));
  const supplierById = new Map(supplierRows.map((s) => [s.id, s]));

  const out: DraftSummary[] = [];
  for (const [key, rows] of groups) {
    const supplier = key === "unassigned" ? null : (supplierById.get(key) ?? null);
    const supplierName = supplier?.name ?? "No supplier assigned";
    const leadTimeDays = supplier?.leadTimeDays ?? rows[0]?.leadTimeDays ?? 14;

    const [existing] = await db
      .select()
      .from(poDrafts)
      .where(
        and(
          eq(poDrafts.shopId, shop.id),
          eq(poDrafts.status, "draft"),
          supplier ? eq(poDrafts.supplierId, supplier.id) : sql`${poDrafts.supplierId} is null`,
        ),
      )
      .limit(1);

    let draft: PoDraft;
    let created = false;
    if (existing) {
      draft = existing;
    } else {
      const [inserted] = await db
        .insert(poDrafts)
        .values({
          shopId: shop.id,
          supplierId: supplier?.id ?? null,
          supplierName,
          leadTimeDays,
          status: "draft",
        })
        .returning();
      draft = inserted;
      created = true;
    }

    for (const row of rows) {
      const cost = lineUnitCost(row);
      const qty = roundToOrderable(row.reorderQty, row.moq, row.packSize);
      await db
        .insert(poDraftLines)
        .values({
          poDraftId: draft.id,
          variantId: row.variantId,
          sku: row.sku,
          title: row.displayTitle,
          suggestedQty: qty,
          finalQty: qty,
          unitCostCents: cost.cents,
        })
        .onConflictDoUpdate({
          target: [poDraftLines.poDraftId, poDraftLines.variantId],
          set: {
            sku: row.sku,
            title: row.displayTitle,
            suggestedQty: qty,
            unitCostCents: cost.cents,
          },
        });
    }

    const totals = await recalcDraft(draft.id);
    out.push({
      draftId: draft.id,
      supplierId: supplier?.id ?? null,
      supplierName,
      lineCount: totals.lineCount,
      totalCents: totals.totalCents,
      created,
    });
  }

  return { drafts: out, suppressed: skippedSuppressed, unassigned };
}

/** Recompute a draft's line count and total from its lines. */
export async function recalcDraft(
  draftId: string,
): Promise<{ lineCount: number; totalCents: number }> {
  const db = getDb();
  const [row] = await db
    .select({
      lineCount: sql<number>`count(*)::int`,
      totalCents: sql<number>`coalesce(sum(${poDraftLines.finalQty} * ${poDraftLines.unitCostCents}), 0)::int`,
    })
    .from(poDraftLines)
    .where(eq(poDraftLines.poDraftId, draftId));
  const lineCount = row?.lineCount ?? 0;
  const totalCents = row?.totalCents ?? 0;
  await db.update(poDrafts).set({ lineCount, totalCents }).where(eq(poDrafts.id, draftId));
  return { lineCount, totalCents };
}

/* ------------------------------------------------------------------- send --- */

export interface SendDraftResult {
  sentTo: string;
  suppressed: boolean;
  lineCount: number;
  totalCents: number;
  suppressUntil: Date;
}

/**
 * Email a draft to its supplier, with the CSV attached, then suppress its SKUs
 * for one lead time.
 *
 * `reply-to` is the merchant's own address, not ours: a supplier replying
 * "we only have 120" must land in the merchant's inbox.
 */
export async function sendDraft(shop: Shop, draftId: string): Promise<SendDraftResult> {
  const db = getDb();
  const [draft] = await db
    .select()
    .from(poDrafts)
    .where(and(eq(poDrafts.id, draftId), eq(poDrafts.shopId, shop.id)))
    .limit(1);
  if (!draft) throw new NotFoundError("That PO draft does not exist.");
  if (draft.status !== "draft") throw new ValidationError("That PO has already been sent.");

  const lines = await db
    .select()
    .from(poDraftLines)
    .where(eq(poDraftLines.poDraftId, draft.id))
    .orderBy(poDraftLines.sku);
  const live = lines.filter((line) => line.finalQty > 0);
  if (!live.length) throw new ValidationError("Add a quantity to at least one line first.");

  const supplier = draft.supplierId
    ? ((
        await db.select().from(suppliers).where(eq(suppliers.id, draft.supplierId)).limit(1)
      )[0] ?? null)
    : null;
  if (!supplier?.email) {
    throw new ValidationError(
      supplier
        ? `${supplier.name} has no email address. Add one on the supplier, or export the CSV instead.`
        : "These SKUs have no supplier assigned. Assign one, or export the CSV instead.",
    );
  }

  const today = todayInZone(shop.timezone);
  const totalCents = live.reduce((sum, line) => sum + line.finalQty * line.unitCostCents, 0);
  const csv = renderCsv({
    draft,
    lines: live,
    shopName: shop.name,
    shopDomain: shop.shopifyDomain,
    today,
  });

  const rowsHtml = live
    .map(
      (line) =>
        `<tr>
<td style="padding:10px 0;border-bottom:1px solid #2b251a;font-family:'Spline Sans Mono',Consolas,monospace;font-size:13px;color:#a79d89;">${escapeHtml(line.sku)}</td>
<td style="padding:10px 8px;border-bottom:1px solid #2b251a;font-size:14px;">${escapeHtml(line.title)}</td>
<td align="right" style="padding:10px 0;border-bottom:1px solid #2b251a;font-family:'Spline Sans Mono',Consolas,monospace;font-size:14px;">${line.finalQty}</td>
</tr>`,
    )
    .join("");

  const html = emailShell({
    preheader: `${live.length} lines · ${moneyExact(totalCents)}`,
    heading: `Purchase order from ${shop.name}`,
    body: `<p style="margin:0 0 16px;">Order below, CSV attached. Lead time on file is ${draft.leadTimeDays} days, so we are expecting these by ${shortDate(addDaysIso(today, draft.leadTimeDays))}.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>
<p style="margin:16px 0 0;font-family:'Spline Sans Mono',Consolas,monospace;font-size:14px;">TOTAL ${escapeHtml(moneyExact(totalCents))}</p>
${shop.email ? `<p style="margin:16px 0 0;font-size:14px;color:#a79d89;">Reply to this email to reach ${escapeHtml(shop.email)}.</p>` : ""}`,
    footer: `Sent by ShelfSense for ${escapeHtml(shop.shopifyDomain)}.`,
  });

  const text = [
    `Purchase order from ${shop.name}`,
    "",
    ...live.map((line) => `${line.sku}  ${line.finalQty} x ${line.title}`),
    "",
    `TOTAL ${moneyExact(totalCents)}`,
  ].join("\n");

  const result = await sendEmail({
    to: supplier.email,
    subject: `Purchase order · ${shop.name} · ${live.length} lines`,
    html,
    text,
    replyTo: shop.email ?? undefined,
    attachments: [{ filename: csvFilename(draft, today), content: csv }],
  });
  if (!result.ok) {
    throw new ValidationError(result.error ?? "The PO could not be emailed. Try the CSV export.");
  }

  const suppressUntil = new Date(Date.now() + draft.leadTimeDays * 86_400_000);
  await db
    .update(poDrafts)
    .set({
      status: "sent",
      sentAt: new Date(),
      sentToEmail: supplier.email,
      lineCount: live.length,
      totalCents,
      suppressUntil,
    })
    .where(eq(poDrafts.id, draft.id));

  return {
    sentTo: supplier.email,
    suppressed: result.suppressed,
    lineCount: live.length,
    totalCents,
    suppressUntil,
  };
}

/** Dismiss a draft: same suppression window, no email. */
export async function dismissDraft(shop: Shop, draftId: string): Promise<void> {
  const db = getDb();
  const [draft] = await db
    .select()
    .from(poDrafts)
    .where(and(eq(poDrafts.id, draftId), eq(poDrafts.shopId, shop.id)))
    .limit(1);
  if (!draft) throw new NotFoundError("That PO draft does not exist.");
  if (draft.status !== "draft") throw new ValidationError("That PO is no longer a draft.");

  await db
    .update(poDrafts)
    .set({
      status: "dismissed",
      dismissedAt: new Date(),
      suppressUntil: new Date(Date.now() + draft.leadTimeDays * 86_400_000),
    })
    .where(eq(poDrafts.id, draft.id));
}

/** Set an edited quantity, validated, and refresh the draft total. */
export async function setLineQty(
  shop: Shop,
  draftId: string,
  lineId: string,
  finalQty: number,
): Promise<LineValidation> {
  const db = getDb();
  const [row] = await db
    .select({
      line: poDraftLines,
      draft: poDrafts,
      moq: variants.moq,
      packSize: variants.packSize,
    })
    .from(poDraftLines)
    .innerJoin(poDrafts, eq(poDrafts.id, poDraftLines.poDraftId))
    .innerJoin(variants, eq(variants.id, poDraftLines.variantId))
    .where(
      and(
        eq(poDraftLines.id, lineId),
        eq(poDraftLines.poDraftId, draftId),
        eq(poDrafts.shopId, shop.id),
      ),
    )
    .limit(1);
  if (!row) throw new NotFoundError("That PO line does not exist.");
  if (row.draft.status !== "draft") throw new ValidationError("That PO is no longer editable.");

  const check = validateLine({ finalQty, moq: row.moq, packSize: row.packSize });
  const qty = Math.max(0, Math.floor(finalQty));
  await db.update(poDraftLines).set({ finalQty: qty }).where(eq(poDraftLines.id, lineId));
  await recalcDraft(draftId);
  return check;
}

/** Day arithmetic for the "expected by" line in the PO email. */
function addDaysIso(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Re-exported so callers have one import for "the PO module". The split exists to keep
 * the pure formatting testable without a database, not to make the seam a caller's
 * problem.
 */
export {
  csvFilename,
  lineUnitCost,
  renderCsv,
  validateDraft,
  validateLine,
  type DraftValidation,
  type LineValidation,
};
