/**
 * src/lib/packets.ts
 *
 * Invoice-packet assembly: generated invoice PDF + rate con + POD
 * photos merged into one document, AFTER the completeness check — the
 * bounce-killer. A missing piece blocks with a named reason ("No POD on
 * this load yet"), never a partial packet.
 *
 * TODO:
 * - [ ] checkCompleteness(loadId): { ok, missing: string[] } — rate con
 *       present, POD present, invoice amount = rate + billed
 *       accessorials.
 * - [ ] renderInvoicePdf(invoiceId): pdf-lib single page per DESIGN.md
 *       type roles (Plex Mono numerals).
 * - [ ] buildPacket(invoiceId): merge invoice + rate con + PODs; write
 *       documents(kind: "packet"); idempotent per content hash.
 * - [ ] factoringCsv(exportId): schedule-of-accounts rows in the
 *       factor's column format (triumph | rts | otr | generic).
 */

export async function checkCompleteness(
  loadId: string,
): Promise<{ ok: boolean; missing: string[] }> {
  throw new Error("Not implemented");
}

export async function buildPacket(invoiceId: string): Promise<{ packetDocumentId: string }> {
  throw new Error("Not implemented");
}

export async function factoringCsv(exportId: string): Promise<{ csvR2Key: string }> {
  throw new Error("Not implemented");
}
