/**
 * Anti-abuse. Pure functions — the caller gathers the signals from the database
 * and passes them in, so every rule here is unit-testable (fraud.test.ts).
 *
 * The threat is specific: referral rewards pay in queue positions, so the
 * cheapest attack is one person signing up as several people. Three defences,
 * in order of how much they can be trusted:
 *
 *  1. Canonical email. `a+1@gmail.com`, `a.b@gmail.com` and `A@Gmail.com` are
 *     one person. This one is near-certain, so it blocks outright.
 *  2. Disposable domains. A mailbox that dies in ten minutes is not a signup.
 *     Also near-certain, also blocks.
 *  3. Everything else — shared IP, burst velocity, role addresses — is
 *     circumstantial (offices, universities, and households share addresses),
 *     so it *quarantines for review* rather than rejecting. A false block on a
 *     real signup is a worse outcome for the founder than a queued review.
 */

import { createHmac } from "node:crypto";

/**
 * Known disposable / throwaway mail providers. Deliberately a hand-kept list of
 * well-known offenders rather than a downloaded 100k-line dump: the long tail
 * moves weekly, and blocking a real provider by accident silently costs
 * signups. Anything not on the list is scored, not blocked.
 */
export const DISPOSABLE_DOMAINS: ReadonlySet<string> = new Set([
  "0-mail.com",
  "10minutemail.com",
  "10minutemail.net",
  "20minutemail.com",
  "33mail.com",
  "anonbox.net",
  "byom.de",
  "dispostable.com",
  "dropmail.me",
  "email-fake.com",
  "emailondeck.com",
  "fakeinbox.com",
  "fakemailgenerator.com",
  "getairmail.com",
  "getnada.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamail.org",
  "harakirimail.com",
  "inboxbear.com",
  "inboxkitten.com",
  "jetable.org",
  "mail-temporaire.fr",
  "mail7.io",
  "mailcatch.com",
  "maildrop.cc",
  "mailinator.com",
  "mailnesia.com",
  "mailsac.com",
  "mailtemp.net",
  "mintemail.com",
  "moakt.com",
  "mohmal.com",
  "mytemp.email",
  "nowmymail.com",
  "sharklasers.com",
  "spam4.me",
  "spamgourmet.com",
  "tempail.com",
  "tempinbox.com",
  "temp-mail.io",
  "temp-mail.org",
  "tempmail.net",
  "tempmailo.com",
  "tempr.email",
  "throwawaymail.com",
  "trashmail.com",
  "trashmail.de",
  "trbvm.com",
  "vomoto.com",
  "wegwerfmail.de",
  "yopmail.com",
  "yopmail.fr",
  "yopmail.net",
]);

/**
 * Providers that ignore dots in the local part. Applying this to every domain
 * would be wrong — plenty of mail servers treat `a.b@` and `ab@` as different
 * people — so it is opt-in per provider.
 */
const DOT_INSENSITIVE_DOMAINS: ReadonlySet<string> = new Set([
  "gmail.com",
  "googlemail.com",
]);

/** Domain aliases that resolve to the same mailbox. */
const DOMAIN_ALIASES: Readonly<Record<string, string>> = {
  "googlemail.com": "gmail.com",
  "hotmail.co.uk": "hotmail.com",
  "live.co.uk": "live.com",
};

/** Addresses that are a function, not a person, and rarely a real waitlist joiner. */
const ROLE_LOCALS: ReadonlySet<string> = new Set([
  "admin",
  "billing",
  "contact",
  "help",
  "hello",
  "hostmaster",
  "info",
  "mail",
  "marketing",
  "noreply",
  "no-reply",
  "office",
  "postmaster",
  "root",
  "sales",
  "spam",
  "support",
  "test",
  "webmaster",
]);

/** RFC-shaped enough for a signup form; deliberately not a full RFC 5322 parser. */
const EMAIL_RE = /^[^\s@,;:<>"'()[\]\\]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

export function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  if (trimmed.length < 6 || trimmed.length > 254) return false;
  if (trimmed.includes("..")) return false;
  return EMAIL_RE.test(trimmed);
}

export function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 0) return "";
  const domain = email.slice(at + 1).toLowerCase();
  return DOMAIN_ALIASES[domain] ?? domain;
}

export function emailLocal(email: string): string {
  const at = email.lastIndexOf("@");
  return at < 0 ? email.toLowerCase() : email.slice(0, at).toLowerCase();
}

/**
 * The deduplication key. Lower-cased, domain-aliased, plus-tag dropped, and
 * dots removed for providers that ignore them.
 *
 * Idempotent by construction: canonicalize(canonicalize(x)) === canonicalize(x).
 */
export function canonicalizeEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const domain = emailDomain(trimmed);
  let local = emailLocal(trimmed);
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (DOT_INSENSITIVE_DOMAINS.has(domain)) local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

export function isDisposableDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  if (DISPOSABLE_DOMAINS.has(d)) return true;
  // One level of subdomain, e.g. `foo.mailinator.com`.
  const parent = d.split(".").slice(1).join(".");
  return parent.length > 0 && DISPOSABLE_DOMAINS.has(parent);
}

export function isRoleAddress(email: string): boolean {
  const local = emailLocal(email);
  const plus = local.indexOf("+");
  return ROLE_LOCALS.has(plus > 0 ? local.slice(0, plus) : local);
}

export function hasPlusTag(email: string): boolean {
  return emailLocal(email).includes("+");
}

/**
 * Salted IP hash. The raw address is never persisted — clustering only needs
 * equality, and a hash gives that without keeping a personal identifier.
 */
export function hashIp(ip: string | null | undefined, salt: string): string | null {
  if (!ip) return null;
  const normalized = ip.trim().toLowerCase();
  if (!normalized || normalized === "unknown") return null;
  return createHmac("sha256", salt).update(normalized).digest("hex").slice(0, 32);
}

/** Take the first address out of an `X-Forwarded-For` chain. */
export function clientIpFrom(headers: {
  forwardedFor?: string | null;
  realIp?: string | null;
}): string | null {
  const chain = headers.forwardedFor?.split(",")[0]?.trim();
  return chain || headers.realIp?.trim() || null;
}

/* --------------------------------------------------------------- scoring --- */

export type FraudVerdict = "ok" | "review" | "blocked";

/** Quarantine at this score; the referral does not pay until a human clears it. */
export const REVIEW_THRESHOLD = 40;
/** Refuse the signup outright at this score. */
export const BLOCK_THRESHOLD = 80;

export interface FraudSignals {
  email: string;
  ipHash?: string | null;
  /** Signups already on this list from the same IP hash (excluding this one). */
  sameIpCount?: number;
  /** Signups on this list from the same IP hash in the last hour. */
  sameIpRecentCount?: number;
  /** The referrer, when this signup arrived through a share link. */
  referrer?: { ipHash?: string | null } | null;
  userAgent?: string | null;
}

export interface FraudResult {
  score: number;
  verdict: FraudVerdict;
  reasons: string[];
  /** False when the referral must not be credited even if the signup stands. */
  creditReferral: boolean;
}

/**
 * Self-referral: is the person clicking their own share link?
 *
 * Only the canonical-email match is treated as certain. A shared IP is common
 * (one household, one office, one conference wifi) and is scored instead.
 */
export function isSelfReferral(
  candidateEmail: string,
  referrerEmail: string,
): boolean {
  return canonicalizeEmail(candidateEmail) === canonicalizeEmail(referrerEmail);
}

export type AttributionOutcome = "credited" | "self_referral" | "unknown_code" | "none";

export interface Attribution {
  outcome: AttributionOutcome;
  /** The referrer to record, or null when the referral is being dropped. */
  referrerId: string | null;
}

/**
 * Decide whether a `?ref=` code becomes an attribution, *before* fraud scoring.
 *
 * Dropping the referrer (rather than rejecting the signup) is deliberate: a
 * founder who tests their own page with a second address should still land on
 * the list — they just do not pay themselves a boost for it.
 */
export function resolveAttribution(
  candidateEmail: string,
  referrer: { id: string; email: string } | null | undefined,
  codeWasPresent: boolean,
): Attribution {
  if (!referrer) {
    return { outcome: codeWasPresent ? "unknown_code" : "none", referrerId: null };
  }
  if (isSelfReferral(candidateEmail, referrer.email)) {
    return { outcome: "self_referral", referrerId: null };
  }
  return { outcome: "credited", referrerId: referrer.id };
}

const SIGNALS: Array<{
  reason: string;
  points: number;
  test: (s: FraudSignals) => boolean;
}> = [
  {
    reason: "disposable email domain",
    points: 100,
    test: (s) => isDisposableDomain(emailDomain(s.email)),
  },
  {
    reason: "same network as the referrer",
    points: 45,
    test: (s) =>
      Boolean(s.referrer?.ipHash && s.ipHash && s.referrer.ipHash === s.ipHash),
  },
  {
    reason: "three or more signups from this network in the last hour",
    points: 40,
    test: (s) => (s.sameIpRecentCount ?? 0) >= 3,
  },
  {
    reason: "many signups from this network",
    points: 20,
    test: (s) => (s.sameIpCount ?? 0) >= 5,
  },
  {
    reason: "plus-alias address",
    points: 15,
    test: (s) => hasPlusTag(s.email),
  },
  {
    reason: "role address, not a person",
    points: 20,
    test: (s) => isRoleAddress(s.email),
  },
  {
    reason: "no user agent",
    points: 10,
    test: (s) => !s.userAgent,
  },
];

export function scoreSignup(signals: FraudSignals): FraudResult {
  const reasons: string[] = [];
  let score = 0;
  for (const rule of SIGNALS) {
    if (rule.test(signals)) {
      score += rule.points;
      reasons.push(rule.reason);
    }
  }
  score = Math.min(100, score);

  const verdict: FraudVerdict =
    score >= BLOCK_THRESHOLD ? "blocked" : score >= REVIEW_THRESHOLD ? "review" : "ok";

  // A quarantined signup keeps its place in line but must not pay its referrer
  // until reviewed — otherwise the review queue is decoration.
  return { score, verdict, reasons, creditReferral: verdict === "ok" };
}

/** One-line summary for the review queue row. */
export function fraudSummary(result: Pick<FraudResult, "score" | "reasons">): string {
  if (!result.reasons.length) return "clean";
  return `${result.score}/100 · ${result.reasons.join(", ")}`;
}
