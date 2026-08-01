/**
 * A minimal HS256 verifier for the Edge middleware.
 *
 * `jose` is the authority everywhere else (src/lib/auth.ts), but importing it
 * into middleware drags its JWE decrypt path — and therefore
 * `DecompressionStream` — into the Edge bundle, which Next reports as an
 * unsupported Node API on every build. Middleware only needs to answer one
 * question about one algorithm, and WebCrypto is available at the edge, so it
 * answers it here.
 *
 * This is a *gate*, not the authority: every protected page independently calls
 * `getSession()`, which verifies with jose. A false negative here costs a
 * redirect to /login; a false positive is caught one layer in.
 */

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJson(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export interface EdgeClaims {
  kind?: string;
  exp?: number;
  [key: string]: unknown;
}

/**
 * Verify signature and expiry. Returns the claims, or null.
 *
 * Only `HS256` is accepted — an `alg: "none"` header, or any other algorithm, is
 * a forgery attempt and gets nothing.
 */
export async function verifyHs256(token: string, secret: string): Promise<EdgeClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts;

  const header = decodeJson(headerPart);
  if (!header || header.alg !== "HS256") return null;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  let valid: boolean;
  try {
    valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(signaturePart),
      new TextEncoder().encode(`${headerPart}.${payloadPart}`),
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  const claims = decodeJson(payloadPart) as EdgeClaims | null;
  if (!claims) return null;
  if (typeof claims.exp === "number" && claims.exp * 1000 <= Date.now()) return null;
  return claims;
}
