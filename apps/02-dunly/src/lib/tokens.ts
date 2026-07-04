/**
 * Signed card-update tokens: JWT, 30-day expiry, scoped to a customer and
 * (optionally) a specific payment failure. No login required on the hosted
 * page — the token IS the auth.
 */

import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

const EXPIRY_DAYS = 30;

export interface CardUpdateClaims {
  customerId: string;
  paymentFailureId?: string;
  organizationId: string;
}

function key(): Uint8Array {
  return new TextEncoder().encode(env.cardTokenSecret);
}

export async function signCardUpdateToken(claims: CardUpdateClaims): Promise<string> {
  return new SignJWT({ ...claims, purpose: "card_update" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${EXPIRY_DAYS}d`)
    .sign(key());
}

export async function verifyCardUpdateToken(token: string): Promise<CardUpdateClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key());
    if (payload.purpose !== "card_update") return null;
    return {
      customerId: payload.customerId as string,
      paymentFailureId: payload.paymentFailureId as string | undefined,
      organizationId: payload.organizationId as string,
    };
  } catch {
    return null;
  }
}

export function cardUpdateUrl(token: string): string {
  return `${env.appUrl}/u/${token}`;
}
