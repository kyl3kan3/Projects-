/**
 * src/lib/docs.ts
 *
 * Document generation (pdf-lib): leases (hashed like LensCRM's
 * contracts), statutory notices (certified-mail-ready, addressed from
 * the tenant's legal notice address), statements, rate-change
 * letters, and the lien packet (all notices + the full ledger).
 *
 * TODO:
 * - [ ] renderLease(tenancyId): state template + owner terms + rate;
 *       sha256 hash stored on signature.
 * - [ ] renderNotice(kind, tenancyId, lienCaseId?): body from the
 *       rule step + ledger balance; notices row.
 * - [ ] renderLienPacket(lienCaseId): every notice + ledger printout
 *       in one PDF.
 */

export async function renderLease(tenancyId: string): Promise<{ r2Key: string }> {
  throw new Error("Not implemented");
}

export async function renderNotice(
  kind: "late" | "lien_default" | "lien_sale" | "rate_change" | "statement",
  tenancyId: string,
  lienCaseId?: string,
): Promise<{ noticeId: string; r2Key: string }> {
  throw new Error("Not implemented");
}

export async function renderLienPacket(lienCaseId: string): Promise<{ r2Key: string }> {
  throw new Error("Not implemented");
}
