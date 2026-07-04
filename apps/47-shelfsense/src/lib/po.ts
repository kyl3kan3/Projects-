/**
 * src/lib/po.ts
 *
 * Purchase-order drafts: group order_now/order_soon variants by supplier,
 * apply MOQ/pack-size rounding, render CSV, and send via Resend. The PO
 * is the product's real output artifact -- treat formatting as a feature.
 *
 * TODO:
 * - [ ] buildDrafts(shopId): group eligible forecasts by supplier ->
 *       po_drafts + po_draft_lines with suggested quantities (reorder.ts).
 * - [ ] validateLine(line, supplier): MOQ / pack-size / min-order-value
 *       checks with human-readable messages for inline UI validation.
 * - [ ] renderCsv(draft): stable column order (SKU, title, qty, unit cost,
 *       line total), UTF-8 BOM so Excel opens it cleanly.
 * - [ ] sendDraft(draftId): email to supplier via Resend with the shop's
 *       reply-to, CSV attached; mark status "sent", record sent_to_email.
 * - [ ] Suppression: variants on a sent/dismissed draft are not
 *       re-suggested for supplier.lead_time_days.
 * - [ ] DRY_RUN=1 short-circuits sends and logs instead.
 */

export interface PoDraftSummary {
  supplierId: string;
  supplierName: string;
  lineCount: number;
  totalCents: number;
}

export function renderCsv(_draftId: string): string {
  throw new Error("Not implemented");
}

export function buildDrafts(_shopId: string): PoDraftSummary[] {
  throw new Error("Not implemented");
}
