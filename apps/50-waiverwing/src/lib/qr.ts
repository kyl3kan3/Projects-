/**
 * src/lib/qr.ts
 *
 * QR + tokenized sign links: the self-serve on-ramp and, via the poster
 * footer, the marketing channel (README go-to-market 3).
 *
 * TODO:
 * - [ ] issueSignToken(locationId, waiverId?): HMAC-signed token
 *       (SIGN_TOKEN_SECRET) resolving to location + live waiver;
 *       location qr_token rotatable (old posters die on rotation --
 *       warn loudly in the UI).
 * - [ ] resolveSignToken(token): location + current waiver version, or
 *       a typed "expired/rotated" result for the calm dead-end page.
 * - [ ] renderQrSvg(url): server-generated SVG via `qrcode`, high
 *       error-correction (posters get scuffed).
 * - [ ] Printable poster layout: venue name, "Scan to sign before you
 *       arrive", the QR, and the "Waivers by WaiverWing" footer
 *       (suppressed on Operator plan).
 * - [ ] One-off emailed sign links (pre-arrival groups) reusing the
 *       same token machinery with short expiry.
 */

export function issueSignToken(_locationId: string, _waiverId?: string): string {
  throw new Error("Not implemented");
}

export function renderQrSvg(_url: string): string {
  throw new Error("Not implemented");
}
