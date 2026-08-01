/**
 * The referral engine's arithmetic. Pure functions only — no database, no
 * clock, no randomness except where a code is explicitly being minted. Every
 * rule that decides where someone stands in a queue lives here so it can be
 * tested exhaustively (see referrals.test.ts).
 *
 * The model, in two numbers per signup:
 *
 *   joinRank    the order they arrived, 1..N, immutable.
 *   boostPoints skip-the-line credit: verified referrals × the list's boost.
 *
 * sortKey = joinRank − boostPoints, ascending, ties broken by joinRank
 * (whoever showed up first keeps the better spot). `position` is that ordering
 * materialized, 1-based and contiguous.
 *
 * Why not just sort on the fly? A hosted page under launch-day load must read
 * one row to answer "what number am I", and the position roll in DESIGN.md
 * needs a stable before/after pair. So the column is materialized and every
 * mutation goes through `applyBoost` below, which touches only the rows the
 * jumper actually passed — never the whole table (ARCHITECTURE.md).
 */

/**
 * Code alphabet: no 0/O/1/I/L/U — these get read aloud, typed from a phone
 * screen, and printed on stickers. Ambiguity here costs real referrals.
 */
export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CODE_LENGTH = 7;

/** Positions a verified referral is worth unless the founder changes it. */
export const DEFAULT_BOOST_PER_REFERRAL = 50;

/* ------------------------------------------------------------------ codes --- */

/**
 * Mint a share code. Takes its randomness as a parameter so tests are
 * deterministic and so callers can pass a CSPRNG.
 */
export function generateReferralCode(
  random: () => number = Math.random,
  length: number = CODE_LENGTH,
): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * Accept a code the way a human will actually paste it: any case, and with
 * spaces, dashes or underscores anywhere. Anything left that is not exactly
 * CODE_LENGTH characters of the alphabet is not a code, and returns null — a
 * bad `?ref=` must degrade to "no referrer", never to a wrong attribution.
 */
export function normalizeReferralCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .trim()
    .toUpperCase()
    .replace(/[\s\-_]+/g, "");
  if (cleaned.length !== CODE_LENGTH) return null;
  for (const ch of cleaned) {
    if (!CODE_ALPHABET.includes(ch)) return null;
  }
  return cleaned;
}

/** The URL a signup shares. Kept here so page, email and widget agree. */
export function shareUrl(pageUrl: string, code: string): string {
  const base = pageUrl.replace(/\/+$/, "");
  return `${base}?ref=${code}`;
}

/* ------------------------------------------------------------------ boost --- */

/**
 * Total boost for a number of credited referrals.
 *
 * `maxBoost` of 0 means uncapped. The cap matters: without it, one motivated
 * sharer with a Twitter following owns the entire top of the queue and the
 * mechanic stops feeling winnable to everyone else.
 */
export function boostPointsFor(
  creditedReferrals: number,
  boostPerReferral: number,
  maxBoost = 0,
): number {
  const raw = Math.max(0, Math.floor(creditedReferrals)) * Math.max(0, Math.floor(boostPerReferral));
  if (maxBoost > 0) return Math.min(raw, Math.floor(maxBoost));
  return raw;
}

export interface QueueEntry {
  id: string;
  joinRank: number;
  boostPoints: number;
}

export function sortKey(entry: Pick<QueueEntry, "joinRank" | "boostPoints">): number {
  return entry.joinRank - entry.boostPoints;
}

/** Ascending queue order: better sortKey first, earlier joiner wins a tie. */
export function compareQueue(a: QueueEntry, b: QueueEntry): number {
  const ka = sortKey(a);
  const kb = sortKey(b);
  if (ka !== kb) return ka - kb;
  return a.joinRank - b.joinRank;
}

/**
 * Full recompute — the definition of correct. Used to seed a list, to repair
 * one, and as the oracle the incremental path is tested against.
 */
export function computePositions(entries: readonly QueueEntry[]): Map<string, number> {
  const ordered = [...entries].sort(compareQueue);
  const out = new Map<string, number>();
  ordered.forEach((e, i) => out.set(e.id, i + 1));
  return out;
}

export interface PositionedEntry extends QueueEntry {
  position: number;
}

/**
 * Where does `entry` land once its boost changes, given everyone else?
 *
 * 1-based; never below 1; never past the end of the queue.
 */
export function positionFor(
  entry: QueueEntry,
  others: readonly QueueEntry[],
): number {
  let ahead = 0;
  for (const other of others) {
    if (other.id === entry.id) continue;
    if (compareQueue(other, entry) < 0) ahead++;
  }
  return ahead + 1;
}

/**
 * The incremental move, expressed on plain data so it can be tested without a
 * database. `applyBoost` in src/lib/signups.ts is the same three steps in SQL.
 *
 * Adding boost can only move someone *up*, so exactly the people between the
 * new and old position shift down by one. Removing boost (a referral cleared as
 * fraud) moves them down, and the people they had passed shift back up.
 */
export function applyBoostIncremental(
  entries: readonly PositionedEntry[],
  id: string,
  boostDelta: number,
): PositionedEntry[] {
  const subject = entries.find((e) => e.id === id);
  if (!subject) return [...entries];

  const nextBoost = Math.max(0, subject.boostPoints + boostDelta);
  if (nextBoost === subject.boostPoints) return [...entries];

  const moved: QueueEntry = { ...subject, boostPoints: nextBoost };
  const oldPosition = subject.position;
  const newPosition = positionFor(moved, entries);

  return entries.map((e) => {
    if (e.id === id) return { ...e, boostPoints: nextBoost, position: newPosition };
    if (newPosition < oldPosition && e.position >= newPosition && e.position < oldPosition) {
      return { ...e, position: e.position + 1 };
    }
    if (newPosition > oldPosition && e.position > oldPosition && e.position <= newPosition) {
      return { ...e, position: e.position - 1 };
    }
    return e;
  });
}

/* -------------------------------------------------------------- reporting --- */

/**
 * "top 12%". Rounded up so #1 of 8 reads "top 13%" rather than "top 0%", and
 * clamped to 100 so the last person in line is never told something absurd.
 */
export function percentile(position: number, total: number): number {
  if (total <= 0 || position <= 0) return 100;
  return Math.min(100, Math.max(1, Math.ceil((position / total) * 100)));
}

export function percentileLabel(position: number, total: number): string {
  return `top ${percentile(position, total)}%`;
}

/** The delta chip in DESIGN.md's position roll: `▲ 49`. Never negative. */
export function positionDelta(before: number, after: number): number {
  return Math.max(0, before - after);
}

/**
 * Viral coefficient: credited referrals per person on the list. Above 1.0 the
 * list grows on its own. Reported to two decimals because founders quote it.
 */
export function kFactor(activeSignups: number, creditedReferrals: number): number {
  if (activeSignups <= 0) return 0;
  return Math.round((creditedReferrals / activeSignups) * 100) / 100;
}

/** Page views → signups, as a whole percentage. */
export function conversionRate(views: number, signups: number): number {
  if (views <= 0) return 0;
  return Math.min(100, Math.round((signups / views) * 100));
}

/* ---------------------------------------------------------------- rewards --- */

export interface RewardTier {
  id: string;
  threshold: number;
  label: string;
  description?: string;
}

export interface RewardProgress {
  reward: RewardTier;
  unlocked: boolean;
  /** Referrals counted toward this tier, clamped to the threshold. */
  progress: number;
  remaining: number;
}

const byThreshold = (a: RewardTier, b: RewardTier) => a.threshold - b.threshold;

/** Every tier with its state, cheapest first — the stack of gate cards. */
export function rewardProgress(
  creditedReferrals: number,
  tiers: readonly RewardTier[],
): RewardProgress[] {
  return [...tiers].sort(byThreshold).map((reward) => {
    const unlocked = creditedReferrals >= reward.threshold;
    return {
      reward,
      unlocked,
      progress: Math.min(creditedReferrals, reward.threshold),
      remaining: Math.max(0, reward.threshold - creditedReferrals),
    };
  });
}

export function unlockedRewards(
  creditedReferrals: number,
  tiers: readonly RewardTier[],
): RewardTier[] {
  return [...tiers].sort(byThreshold).filter((t) => creditedReferrals >= t.threshold);
}

/** The next gate, or null when everything is unlocked. */
export function nextReward(
  creditedReferrals: number,
  tiers: readonly RewardTier[],
): RewardProgress | null {
  return rewardProgress(creditedReferrals, tiers).find((p) => !p.unlocked) ?? null;
}

/**
 * The one line that must be present with every animation removed
 * (DESIGN.md, reduced motion): "You're #347 · top 12% · 2 more referrals to
 * Early access".
 */
export function positionSummary(
  position: number,
  total: number,
  creditedReferrals: number,
  tiers: readonly RewardTier[],
): string {
  const parts = [`You're #${position}`, percentileLabel(position, total)];
  const next = nextReward(creditedReferrals, tiers);
  if (next) {
    const n = next.remaining;
    parts.push(`${n} more referral${n === 1 ? "" : "s"} to ${next.reward.label}`);
  } else if (tiers.length) {
    parts.push("every reward unlocked");
  }
  return parts.join(" · ");
}

/** The default ladder a new list ships with — real tiers, not placeholders. */
export const DEFAULT_REWARD_TIERS: readonly Omit<RewardTier, "id">[] = [
  { threshold: 3, label: "Early access", description: "In the first group let through the door." },
  { threshold: 10, label: "Founding price", description: "Locked at launch pricing for life." },
  { threshold: 25, label: "Lifetime deal", description: "One payment, yours forever." },
];
