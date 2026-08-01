/**
 * src/lib/waivers.ts
 *
 * Waiver builder + immutable versioning.
 *
 * `renderVersionText` is the load-bearing function in this file and arguably in
 * the product. It is the ONE canonical rendering of a waiver version: it feeds
 * the screen the signer reads, the copy stored on the signature, the SHA-256
 * that proves it, and the PDF handed to counsel. Because there is only one, the
 * text a signer saw and the text a hash covers cannot drift apart.
 *
 * Publishing never mutates: it snapshots the draft into version N+1 along with
 * the expiry and minor rules in force at that moment.
 */

import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  DEFAULT_MINOR_RULE,
  waiverVersions,
  waivers,
  type ExpiryRule,
  type InitialedClauseConfig,
  type LiabilityTextConfig,
  type MinorRule,
  type QuestionConfig,
  type SignatureBlockConfig,
  type Waiver,
  type WaiverBlock,
  type WaiverVersion,
} from "@/db/schema";
import { addDays, endOfLocalDay } from "@/lib/time";

export class ValidationError extends Error {}

/* ---------------------------------------------------------- block helpers */

export function liabilityConfig(b: WaiverBlock): LiabilityTextConfig {
  const c = b.config as Partial<LiabilityTextConfig>;
  return { heading: String(c.heading ?? ""), body: String(c.body ?? "") };
}

export function clauseConfig(b: WaiverBlock): InitialedClauseConfig {
  const c = b.config as Partial<InitialedClauseConfig>;
  return { text: String(c.text ?? ""), prompt: String(c.prompt ?? "Initial to agree") };
}

export function questionConfig(b: WaiverBlock): QuestionConfig {
  const c = b.config as Partial<QuestionConfig>;
  return {
    label: String(c.label ?? ""),
    kind: (c.kind ?? "text") as QuestionConfig["kind"],
    required: Boolean(c.required),
    medical: Boolean(c.medical),
    help: c.help ? String(c.help) : undefined,
  };
}

export function signatureConfig(blocks: WaiverBlock[]): SignatureBlockConfig {
  const b = blocks.find((x) => x.kind === "signature");
  const c = (b?.config ?? {}) as Partial<SignatureBlockConfig>;
  return {
    disclosure: String(
      c.disclosure ??
        "By signing below I confirm I have read this waiver, that I am signing it voluntarily, and that my electronic signature has the same effect as a handwritten one.",
    ),
    allowDrawn: c.allowDrawn !== false,
  };
}

export function clauseBlocks(blocks: WaiverBlock[]): WaiverBlock[] {
  return blocks.filter((b) => b.kind === "initialed_clause");
}

export function questionBlocks(blocks: WaiverBlock[]): WaiverBlock[] {
  return blocks.filter((b) => b.kind === "question");
}

/* -------------------------------------------------------------- validation */

/** Returns a list of human-readable problems; empty means publishable. */
export function validateBlocks(blocks: WaiverBlock[]): string[] {
  const problems: string[] = [];

  const liability = blocks.filter((b) => b.kind === "liability_text");
  if (liability.length === 0) {
    problems.push("Add at least one liability text block — that's the waiver itself.");
  }
  for (const b of liability) {
    const c = liabilityConfig(b);
    if (!c.heading.trim()) problems.push("Every liability block needs a heading.");
    if (c.body.trim().length < 40) {
      problems.push(`"${c.heading || "Untitled block"}" is too short to be a real waiver clause.`);
    }
  }

  const signatures = blocks.filter((b) => b.kind === "signature");
  if (signatures.length === 0) problems.push("Add the signature block — nobody can sign without it.");
  if (signatures.length > 1) problems.push("A waiver has exactly one signature block.");
  if (signatures.length === 1 && !signatureConfig(blocks).disclosure.trim()) {
    problems.push("The signature block needs a consent-to-sign disclosure sentence.");
  }

  for (const b of clauseBlocks(blocks)) {
    const c = clauseConfig(b);
    if (!c.text.trim()) problems.push("An initialed clause has no text.");
  }

  for (const b of questionBlocks(blocks)) {
    const c = questionConfig(b);
    if (!c.label.trim()) problems.push("A custom question has no label.");
  }

  const keys = blocks.map((b) => b.key);
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (dupes.length) problems.push(`Duplicate block keys: ${[...new Set(dupes)].join(", ")}.`);
  if (keys.some((k) => !k.trim())) problems.push("Every block needs a stable key.");

  return problems;
}

/* ------------------------------------------------- the canonical rendering */

export interface RenderableVersion {
  title: string;
  version: number;
  bodyBlocks: WaiverBlock[];
  expiryRule: ExpiryRule;
  minorRule: MinorRule;
}

export function expiryRuleLabel(rule: ExpiryRule): string {
  switch (rule) {
    case "visit":
      return "This waiver covers today's visit only.";
    case "days_365":
      return "This waiver is valid for 365 days from the date signed.";
    case "forever":
      return "This waiver remains in effect until revoked in writing.";
  }
}

/** Collapse whitespace the way a hash needs: stable, but not lossy. */
function canonicalProse(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The canonical plain-text rendering of a waiver version.
 *
 * Stable across processes and across time: no dates, no ids, no locale
 * formatting, no iteration over objects. Change this function and every future
 * hash changes — which is exactly why past signatures carry their own copy of
 * the output rather than re-deriving it.
 */
export function renderVersionText(v: RenderableVersion): string {
  const out: string[] = [];
  out.push(`WAIVER: ${canonicalProse(v.title)}`);
  out.push(`VERSION: ${v.version}`);
  out.push(`TERM: ${expiryRuleLabel(v.expiryRule)}`);
  out.push(
    `MINORS: Participants under ${v.minorRule.ageOfMajority} must be signed for by a parent or legal guardian.`,
  );

  for (const block of v.bodyBlocks) {
    if (block.kind === "liability_text") {
      const c = liabilityConfig(block);
      out.push("");
      out.push(`SECTION: ${canonicalProse(c.heading)}`);
      out.push(canonicalProse(c.body));
    } else if (block.kind === "initialed_clause") {
      const c = clauseConfig(block);
      out.push("");
      out.push(`CLAUSE [${block.key}] (initials required): ${canonicalProse(c.text)}`);
    } else if (block.kind === "question") {
      const c = questionConfig(block);
      out.push("");
      out.push(
        `QUESTION [${block.key}]${c.required ? " (required)" : ""}: ${canonicalProse(c.label)}`,
      );
    }
  }

  const sig = signatureConfig(v.bodyBlocks);
  out.push("");
  out.push(`DISCLOSURE: ${canonicalProse(sig.disclosure)}`);

  return out.join("\n");
}

/** SHA-256, hex, of the canonical rendering. */
export function hashText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function versionTextHash(v: RenderableVersion): string {
  return hashText(renderVersionText(v));
}

/** `4B1E…9C77` — the mono evidence-line form (DESIGN.md). */
export function shortHash(hash: string): string {
  if (hash.length < 8) return hash.toUpperCase();
  return `${hash.slice(0, 4).toUpperCase()}…${hash.slice(-4).toUpperCase()}`;
}

/* ------------------------------------------------------------- expiry rule */

/**
 * When coverage from a signature lapses.
 *
 * `visit` needs the venue's timezone: "today's visit" ends when the venue's day
 * ends, not 24 hours after the signature. `forever` returns null.
 */
export function expiresAt(
  rule: ExpiryRule,
  signedAt: Date,
  timeZone = "UTC",
): Date | null {
  switch (rule) {
    case "visit":
      return endOfLocalDay(signedAt, timeZone);
    case "days_365":
      return addDays(signedAt, 365);
    case "forever":
      return null;
  }
}

/* ------------------------------------------------------------------ writes */

export async function createWaiver(input: {
  accountId: string;
  title: string;
  expiryRule?: ExpiryRule;
  minorRule?: Partial<MinorRule>;
  activityTags?: string[];
  draftBlocks: WaiverBlock[];
}): Promise<Waiver> {
  if (!input.title.trim()) throw new ValidationError("Give the waiver a title.");
  const db = getDb();
  const [row] = await db
    .insert(waivers)
    .values({
      accountId: input.accountId,
      title: input.title.trim(),
      expiryRule: input.expiryRule ?? "days_365",
      minorRule: { ...DEFAULT_MINOR_RULE, ...(input.minorRule ?? {}) },
      activityTags: input.activityTags ?? [],
      draftBlocks: input.draftBlocks,
    })
    .returning();
  return row;
}

export async function updateDraft(
  waiverId: string,
  accountId: string,
  patch: {
    title?: string;
    expiryRule?: ExpiryRule;
    minorRule?: Partial<MinorRule>;
    activityTags?: string[];
    draftBlocks?: WaiverBlock[];
  },
): Promise<void> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(waivers)
    .where(and(eq(waivers.id, waiverId), eq(waivers.accountId, accountId)));
  if (!existing) throw new ValidationError("That waiver does not exist.");

  await db
    .update(waivers)
    .set({
      title: patch.title?.trim() || existing.title,
      expiryRule: patch.expiryRule ?? existing.expiryRule,
      minorRule: patch.minorRule
        ? { ...existing.minorRule, ...patch.minorRule }
        : existing.minorRule,
      activityTags: patch.activityTags ?? existing.activityTags,
      draftBlocks: patch.draftBlocks ?? existing.draftBlocks,
      updatedAt: new Date(),
    })
    .where(eq(waivers.id, waiverId));
}

/**
 * Snapshot the draft into a new version and mark the waiver live.
 *
 * Nothing here touches an existing version row. A waiver edited after someone
 * signed produces version N+1; version N — and every signature that copied it —
 * is untouched.
 */
export async function publish(waiverId: string, accountId: string): Promise<WaiverVersion> {
  const db = getDb();
  const [waiver] = await db
    .select()
    .from(waivers)
    .where(and(eq(waivers.id, waiverId), eq(waivers.accountId, accountId)));
  if (!waiver) throw new ValidationError("That waiver does not exist.");

  const problems = validateBlocks(waiver.draftBlocks);
  if (problems.length) throw new ValidationError(problems.join(" "));

  const [latest] = await db
    .select({ version: waiverVersions.version })
    .from(waiverVersions)
    .where(eq(waiverVersions.waiverId, waiverId))
    .orderBy(desc(waiverVersions.version))
    .limit(1);

  const version = (latest?.version ?? 0) + 1;
  const renderable: RenderableVersion = {
    title: waiver.title,
    version,
    bodyBlocks: waiver.draftBlocks,
    expiryRule: waiver.expiryRule,
    minorRule: waiver.minorRule,
  };

  const [row] = await db
    .insert(waiverVersions)
    .values({
      waiverId,
      accountId,
      version,
      title: waiver.title,
      bodyBlocks: waiver.draftBlocks,
      expiryRule: waiver.expiryRule,
      minorRule: waiver.minorRule,
      textHash: versionTextHash(renderable),
    })
    .returning();

  await db
    .update(waivers)
    .set({ status: "live", updatedAt: new Date() })
    .where(eq(waivers.id, waiverId));

  return row;
}

export async function liveVersion(waiverId: string): Promise<WaiverVersion | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(waiverVersions)
    .where(eq(waiverVersions.waiverId, waiverId))
    .orderBy(desc(waiverVersions.version))
    .limit(1);
  return row ?? null;
}

export async function listWaivers(accountId: string): Promise<Waiver[]> {
  const db = getDb();
  return db
    .select()
    .from(waivers)
    .where(eq(waivers.accountId, accountId))
    .orderBy(desc(waivers.updatedAt));
}

export async function listVersions(waiverId: string): Promise<WaiverVersion[]> {
  const db = getDb();
  return db
    .select()
    .from(waiverVersions)
    .where(eq(waiverVersions.waiverId, waiverId))
    .orderBy(desc(waiverVersions.version));
}
