import { jwtVerify, SignJWT } from "jose";
import { serverEnv } from "./env";

export interface CardUpdateTokenPayload {
  organizationId: string;
  stripeAccountId: string;
  customerId: string;
  paymentFailureId?: string;
  amountCents?: number;
}

const encoder = new TextEncoder();

function tokenSecret() {
  return encoder.encode(serverEnv.cardUpdateTokenSecret);
}

export async function signCardUpdateToken(payload: CardUpdateTokenPayload, expiresIn = "30d"): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .setAudience("dunly-card-update")
    .sign(tokenSecret());
}

export async function verifyCardUpdateToken(token: string): Promise<CardUpdateTokenPayload> {
  const { payload } = await jwtVerify(token, tokenSecret(), {
    audience: "dunly-card-update",
  });

  return {
    organizationId: String(payload.organizationId),
    stripeAccountId: String(payload.stripeAccountId),
    customerId: String(payload.customerId),
    paymentFailureId: typeof payload.paymentFailureId === "string" ? payload.paymentFailureId : undefined,
    amountCents: typeof payload.amountCents === "number" ? payload.amountCents : undefined,
  };
}
