/**
 * src/lib/contracts.ts
 *
 * Quote/contract rendering and the e-sign audit trail (the LensCRM
 * pattern): render terms + lines + damage-fee schedule to PDF
 * (pdf-lib), capture signature + initials-on-damage-clause, sha256 the
 * signed document, store hash + signature image key on the order.
 *
 * TODO:
 * - [ ] renderQuotePdf(orderId) / renderSignedContract(orderId,
 *       signaturePngBytes).
 * - [ ] hashDocument(bytes): sha256 hex.
 * - [ ] mintSignToken / verifySignToken (jose, hash stored on order).
 * - [ ] Run sheets: renderRunSheet(runId) — stop order + per-truck
 *       aggregated load list.
 */

export async function renderQuotePdf(orderId: string): Promise<{ r2Key: string }> {
  throw new Error("Not implemented");
}

export async function hashDocument(bytes: Uint8Array): Promise<string> {
  throw new Error("Not implemented");
}

export async function renderRunSheet(runId: string): Promise<{ r2Key: string }> {
  throw new Error("Not implemented");
}
