/**
 * CI credentials.
 *
 * A token is shown exactly once and stored only as a SHA-256 hash, so a
 * database dump does not hand anyone push access. Lookup is by hash, which is a
 * single indexed equality — no scan over candidate rows.
 *
 * Tokens are scoped: `apiId` set means the token may only touch that API, which
 * is the shape a CI job wants (one repo, one API, least privilege). An org-wide
 * token exists for people running several pipelines from one secret store.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { apis, apiTokens, organizations, type ApiToken, type Organization, type WatchedApi } from "@/db/schema";

const PREFIX = "ss_";

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Constant-time compare of two hex digests of equal length. */
export function digestsEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

export function generateToken(): { token: string; hash: string; prefix: string } {
  const token = `${PREFIX}${randomBytes(24).toString("base64url")}`;
  return { token, hash: hashToken(token), prefix: token.slice(0, 11) };
}

export interface TokenContext {
  token: ApiToken;
  org: Organization;
  /** Set when the token is scoped to a single API. */
  scopedApi: WatchedApi | null;
}

/**
 * Resolve a bearer token. Returns null for anything unknown, revoked, or
 * malformed — the caller turns that into one 401 with a helpful message, never
 * a hint about which of those it was.
 */
export async function resolveToken(raw: string | null | undefined): Promise<TokenContext | null> {
  if (!raw) return null;
  const token = raw.replace(/^Bearer\s+/i, "").trim();
  if (!token.startsWith(PREFIX) || token.length < 16) return null;

  const db = getDb();
  const [row] = await db
    .select()
    .from(apiTokens)
    .where(and(eq(apiTokens.tokenHash, hashToken(token)), isNull(apiTokens.revokedAt)));
  if (!row) return null;

  const [org] = await db.select().from(organizations).where(eq(organizations.id, row.organizationId));
  if (!org) return null;

  let scopedApi: WatchedApi | null = null;
  if (row.apiId) {
    const [api] = await db.select().from(apis).where(eq(apis.id, row.apiId));
    // A token scoped to a deleted API grants nothing.
    if (!api) return null;
    scopedApi = api;
  }
  return { token: row, org, scopedApi };
}

/** Record use. Best-effort: a failure here must not fail the request. */
export async function touchToken(tokenId: string): Promise<void> {
  try {
    await getDb().update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, tokenId));
  } catch {
    // Deliberately swallowed: last-used is telemetry, not authorization.
  }
}

/** Is this token allowed to act on this API? */
export function tokenCoversApi(ctx: TokenContext, apiId: string): boolean {
  if (!ctx.scopedApi) return true;
  return ctx.scopedApi.id === apiId;
}
