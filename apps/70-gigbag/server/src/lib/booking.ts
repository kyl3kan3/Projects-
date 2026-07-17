/**
 * server/src/lib/booking.ts
 *
 * The confirm discipline: contract render (terms snapshot + gig
 * details, hashed), the booker link flow (sign -> deposit ->
 * confirmed), and the server-side conflict re-check on every
 * advance.
 *
 * TODO:
 * - [ ] initiateConfirm(gigId): render contract PDF, mint booker
 *       token, email the link.
 * - [ ] sign(token, signaturePngBytes, signerName, ip): hash + store;
 *       advance to deposit.
 * - [ ] createDepositIntent(gigId): PI on the band's Connect account;
 *       webhook flips deposit_status and confirms.
 * - [ ] skipProtection(gigId, memberId): the logged cardless confirm.
 * - [ ] assertNoConflict(bandId, date, excludeGigId): named-conflict
 *       error.
 */

export async function initiateConfirm(gigId: string): Promise<{ bookerUrl: string }> {
  throw new Error("Not implemented");
}

export async function assertNoConflict(
  bandId: string,
  date: string,
  excludeGigId?: string,
): Promise<void> {
  throw new Error("Not implemented");
}
