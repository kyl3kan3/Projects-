/**
 * The consent sentence, on its own so the signing form (a client component) can
 * show the exact words the server stores with the signature.
 *
 * It lives here rather than in esign.ts because that module reaches for
 * node:crypto, which has no business in a browser bundle.
 */

export const CONSENT_TEXT =
  "I agree to sign this document electronically, and I accept that my electronic signature is the legal equivalent of my handwritten signature.";
