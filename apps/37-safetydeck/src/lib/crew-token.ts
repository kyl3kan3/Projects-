/**
 * Crew links: the foreman's way in, with no account and no app.
 *
 * A link is a signed JWT scoped to exactly one talk instance, with a hash of the
 * token stored on the instance row. Both halves matter:
 *
 *  - the signature means a token cannot be forged or edited;
 *  - the stored hash means a token can be *revoked* (mint a new one and the old
 *    link stops working), which a stateless JWT alone cannot do. A jobsite link
 *    that leaks in a group text needs a way to be cut off.
 *
 * Expiry is generous — 21 days — because the failure mode of a short expiry is a
 * crew standing in a trench with a dead link. An expired link does not dead-end:
 * `/crew/[token]` renders a screen that names the crew and tells the foreman to
 * ask the office for a resend.
 */

import { createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

const TOKEN_TTL_DAYS = 21;

export interface CrewTokenPayload {
  /** Talk instance id. */
  ti: string;
  /** Crew id, so an error screen can name the crew without a valid instance. */
  cr: string;
}

function key(): Uint8Array {
  return new TextEncoder().encode(env.crewTokenSecret);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function mintCrewToken(
  instanceId: string,
  crewId: string,
): Promise<{ token: string; tokenHash: string }> {
  const token = await new SignJWT({ ti: instanceId, cr: crewId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_DAYS}d`)
    .sign(key());
  return { token, tokenHash: hashToken(token) };
}

export type CrewTokenResult =
  | { ok: true; payload: CrewTokenPayload; tokenHash: string }
  | { ok: false; reason: "expired" | "invalid" };

export async function verifyCrewToken(token: string): Promise<CrewTokenResult> {
  try {
    const { payload } = await jwtVerify(token, key());
    const ti = typeof payload.ti === "string" ? payload.ti : "";
    const cr = typeof payload.cr === "string" ? payload.cr : "";
    if (!ti || !cr) return { ok: false, reason: "invalid" };
    return { ok: true, payload: { ti, cr }, tokenHash: hashToken(token) };
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "ERR_JWT_EXPIRED") return { ok: false, reason: "expired" };
    return { ok: false, reason: "invalid" };
  }
}

export function crewLinkUrl(token: string): string {
  return `${env.appUrl.replace(/\/$/, "")}/crew/${token}`;
}
