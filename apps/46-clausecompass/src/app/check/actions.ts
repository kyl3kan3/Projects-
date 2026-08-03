"use server";

/**
 * The free clause checker behind the landing page's demo.
 *
 * One pasted clause (2,000 characters), typed and scored by exactly the same deterministic
 * playbook the paid product uses, with the same anchoring rule: the quote returned is the
 * text the visitor pasted, never a paraphrase.
 *
 * Rate-limited per IP hash. The upsell is honest arithmetic rather than a nag: this is one
 * clause, and the contract in their inbox has thirty.
 */

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { and, eq, gt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { checkerHits } from "@/db/schema";
import { normalizeWhitespace, parseText, ParseError } from "@/lib/parse";
import { classify, extractFields, pickQuote } from "@/lib/analyze";
import { DEFAULT_RULES, score, type ScorableRule } from "@/lib/playbook";
import { explainFromTemplate } from "@/lib/explain";
import { CLAUSE_LABELS } from "@/lib/taxonomy";
import { clauseSummary } from "@/lib/summaries";

const MAX_CLAUSE_CHARS = 2000;
const HITS_PER_HOUR = 12;

export interface CheckResult {
  error: string | null;
  clauseLabel?: string;
  severity?: "ok" | "caution" | "high";
  quote?: string;
  summary?: string;
  firedBecause?: string;
  explanation?: string;
  forYou?: string;
  market?: string;
  suggested?: string;
}

async function ipHash(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() ?? h.get("x-real-ip") ?? "unknown";
  return createHash("sha256").update(`clausecompass:${ip}`).digest("hex").slice(0, 32);
}

export async function checkClauseAction(
  _prev: CheckResult,
  formData: FormData,
): Promise<CheckResult> {
  const raw = String(formData.get("clause") ?? "");
  const text = normalizeWhitespace(raw);
  if (text.length < 60) {
    return { error: "Paste a whole clause — a line or two is not enough to type it." };
  }
  if (raw.length > MAX_CLAUSE_CHARS) {
    return {
      error: `That is ${raw.length.toLocaleString("en-US")} characters. The free check takes one clause, up to ${MAX_CLAUSE_CHARS.toLocaleString("en-US")}.`,
    };
  }

  // Rate limit before doing any work.
  const db = getDb();
  const hash = await ipHash();
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(checkerHits)
    .where(and(eq(checkerHits.ipHash, hash), gt(checkerHits.createdAt, sql`now() - interval '1 hour'`)));
  if (count >= HITS_PER_HOUR) {
    return {
      error: "That is a lot of clauses in an hour. Take a full review instead — it reads the whole document at once.",
    };
  }
  await db.insert(checkerHits).values({ ipHash: hash });

  const { clauseType } = classify(text);
  if (!clauseType) {
    return {
      error:
        "That does not match any clause type in the taxonomy, so there is nothing honest to say about it. Paste the payment, IP, indemnity, non-compete, renewal or termination clause.",
    };
  }

  // Anchoring still applies: the quote comes from the pasted text itself.
  let quote: string | null = null;
  try {
    const parsed = parseTextLoose(raw);
    quote = pickQuote(parsed, clauseType);
  } catch {
    quote = null;
  }
  if (!quote) return { error: "That clause could not be quoted back cleanly. Try pasting it again." };

  const fields = extractFields(clauseType, text);
  const fired = score({
    contractType: "msa",
    clauses: [{ id: "pasted", clauseType, fields }],
    rules: DEFAULT_RULES as unknown as ScorableRule[],
  }).filter((f) => f.clauseId !== null);

  if (fired.length === 0) {
    return {
      error: null,
      clauseLabel: CLAUSE_LABELS[clauseType],
      severity: "ok",
      quote,
      summary: clauseSummary(clauseType, fields),
      firedBecause: "No rule in the default playbook fired on this clause.",
      explanation:
        "This clause reads as ordinary for small-business work. Nothing in the default playbook questions it.",
      forYou: "There is nothing here the playbook would ask you to renegotiate.",
      market: "",
      suggested: "",
    };
  }

  const flag = fired[0];
  const rule = DEFAULT_RULES.find((r) => r.ruleKey === flag.ruleKey)!;
  const explanation = explainFromTemplate({
    clauseLabel: CLAUSE_LABELS[clauseType],
    quote,
    firedBecause: flag.firedBecause,
    severity: flag.severity,
    rule,
    vars: {
      value: flag.value ?? "—",
      threshold: rule.threshold ?? rule.comparator.threshold ?? "—",
      months: fields.months ?? "—",
    },
  });

  return {
    error: null,
    clauseLabel: CLAUSE_LABELS[clauseType],
    severity: flag.severity,
    quote,
    summary: clauseSummary(clauseType, fields),
    firedBecause: flag.firedBecause,
    explanation: explanation.whatItSays,
    forYou: explanation.forYou,
    market: explanation.market,
    suggested: explanation.redline.suggestedText,
  };
}

/**
 * A single clause is not a contract, so the full parser's "does this look like an
 * agreement" guard would refuse it. The checker keeps the whitespace normalisation and
 * drops the document-level guards.
 */
function parseTextLoose(raw: string): string {
  try {
    return parseText(raw).fullText;
  } catch (err) {
    if (err instanceof ParseError) return normalizeWhitespace(raw);
    throw err;
  }
}
