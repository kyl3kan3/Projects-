/**
 * src/lib/qr.ts
 *
 * Tokenized sign links and the printable QR poster — the self-serve on-ramp and,
 * via the poster footer, a marketing channel (README go-to-market 3).
 *
 * Two kinds of token, on purpose:
 *
 *  - **Poster tokens** are the location's stored `qr_token`. They never expire,
 *    because they are printed on foamboard and screwed to a wall. Rotating one
 *    kills every printed poster, so the UI says exactly that before it does.
 *  - **Link tokens** are HMAC-signed and carry an expiry: emailed pre-arrival
 *    links for a booked group, and the one-tap re-sign link for an expired
 *    participant. Nothing about them is stored, so issuing thousands costs
 *    nothing and revoking is a secret rotation.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  locations,
  waiverVersions,
  waivers,
  type Location,
  type Waiver,
  type WaiverVersion,
} from "@/db/schema";
import { env } from "@/lib/env";
import { liveVersion } from "@/lib/waivers";

const LINK_PREFIX = "wl1";

/** A fresh poster token. Short enough to be typed off a poster in a pinch. */
export function newQrToken(): string {
  return randomBytes(9).toString("base64url");
}

function b64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function unb64url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(payload: string): string {
  return createHmac("sha256", env.signTokenSecret).update(payload).digest("base64url");
}

export interface LinkTokenClaims {
  locationId: string;
  waiverId?: string;
  /** Pre-filled participant for a re-sign link. */
  participantId?: string;
  /** Epoch seconds. */
  exp: number;
}

/**
 * A signed, expiring sign link. Default 14 days: long enough for "sign before
 * you arrive next Saturday", short enough that a forwarded email goes stale.
 */
export function issueLinkToken(
  claims: Omit<LinkTokenClaims, "exp">,
  ttlSeconds = 60 * 60 * 24 * 14,
): string {
  const full: LinkTokenClaims = { ...claims, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const body = b64url(JSON.stringify(full));
  return `${LINK_PREFIX}.${body}.${sign(body)}`;
}

export type LinkTokenResult =
  | { kind: "ok"; claims: LinkTokenClaims }
  | { kind: "expired" }
  | { kind: "invalid" };

export function verifyLinkToken(token: string): LinkTokenResult {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== LINK_PREFIX) return { kind: "invalid" };
  const [, body, mac] = parts;

  const expected = Buffer.from(sign(body));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { kind: "invalid" };
  }

  let claims: LinkTokenClaims;
  try {
    claims = JSON.parse(unb64url(body)) as LinkTokenClaims;
  } catch {
    return { kind: "invalid" };
  }
  if (!claims.locationId || typeof claims.exp !== "number") return { kind: "invalid" };
  if (claims.exp * 1000 < Date.now()) return { kind: "expired" };
  return { kind: "ok", claims };
}

/* ---------------------------------------------------------- resolving both */

export type ResolvedToken =
  | {
      kind: "ok";
      location: Location;
      waiver: Waiver;
      version: WaiverVersion;
      participantId: string | null;
      source: "poster" | "link";
    }
  /** The poster was reprinted, or the link is malformed. */
  | { kind: "unknown" }
  | { kind: "expired" }
  /** Valid location, but nothing published to sign yet. */
  | { kind: "no_live_waiver"; location: Location };

/**
 * Resolve either token kind to a location plus the version to render.
 *
 * A dead token gets a calm dead-end page and leaks nothing about the venue — the
 * only useful instruction at that point is "ask the front desk for a new code".
 */
export async function resolveSignToken(token: string): Promise<ResolvedToken> {
  const db = getDb();

  let location: Location | undefined;
  let waiverId: string | undefined;
  let participantId: string | null = null;
  let source: "poster" | "link" = "poster";

  if (token.startsWith(`${LINK_PREFIX}.`)) {
    source = "link";
    const verified = verifyLinkToken(token);
    if (verified.kind === "expired") return { kind: "expired" };
    if (verified.kind === "invalid") return { kind: "unknown" };
    waiverId = verified.claims.waiverId;
    participantId = verified.claims.participantId ?? null;
    [location] = await db
      .select()
      .from(locations)
      .where(eq(locations.id, verified.claims.locationId));
  } else {
    [location] = await db.select().from(locations).where(eq(locations.qrToken, token));
  }

  if (!location) return { kind: "unknown" };

  let waiver: Waiver | undefined;
  if (waiverId) {
    [waiver] = await db
      .select()
      .from(waivers)
      .where(and(eq(waivers.id, waiverId), eq(waivers.accountId, location.accountId)));
  } else {
    [waiver] = await db
      .select()
      .from(waivers)
      .where(and(eq(waivers.accountId, location.accountId), eq(waivers.status, "live")))
      .orderBy(waivers.createdAt)
      .limit(1);
  }
  if (!waiver) return { kind: "no_live_waiver", location };

  const version = await liveVersion(waiver.id);
  if (!version) return { kind: "no_live_waiver", location };

  return { kind: "ok", location, waiver, version, participantId, source };
}

/** Fetch the published version by id — the kiosk pins one for its session. */
export async function versionById(id: string): Promise<WaiverVersion | null> {
  const db = getDb();
  const [row] = await db.select().from(waiverVersions).where(eq(waiverVersions.id, id));
  return row ?? null;
}

/* ------------------------------------------------------------------ output */

export function signUrl(token: string): string {
  return `${env.appUrl}/sign/${token}`;
}

/**
 * Poster QR as inline SVG. Error correction level H — posters get scuffed,
 * splashed and sun-faded, and a QR that stops scanning in August is a queue.
 */
export async function renderQrSvg(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 1,
    width: 512,
    color: { dark: "#14171A", light: "#F4F4F0" },
  });
}

/** Rotate a location's poster token. Every printed poster stops working. */
export async function rotateQrToken(accountId: string, locationId: string): Promise<string> {
  const db = getDb();
  const token = newQrToken();
  await db
    .update(locations)
    .set({ qrToken: token })
    .where(and(eq(locations.id, locationId), eq(locations.accountId, accountId)));
  return token;
}
