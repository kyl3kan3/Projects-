/**
 * src/lib/acord.ts
 *
 * The deterministic ACORD 25 grammar.
 *
 * An ACORD 25 is a fixed form: a stack of policy blocks, each naming a type of
 * insurance, an ADDL INSD and SUBR WVD column, a policy number, an effective and
 * an expiry date, and one or more labelled limits. This module reads that
 * structure out of the form's text and reports, per field, how sure it is.
 *
 * It is the local extractor: it runs when no model key is configured, and it is
 * what the test suite exercises. The model path (lib/parse.ts) returns the exact
 * same shape, so everything downstream — the review queue, the confidence
 * threshold, the compliance engine — is identical either way.
 *
 * **Confidence is not decoration.** A field that was matched against its printed
 * label scores high; a field inferred from position scores middling; a field that
 * was not found is `null` at confidence 0. Anything below the org's threshold
 * sends the whole certificate to human review. Nothing here ever guesses a limit
 * or a date to make a form look complete.
 */

import { parseLimitToCents } from "@/lib/format";
import { COVERAGE_LABELS } from "@/lib/format";
import { normaliseLines } from "@/lib/pdf-text";
import type { CoverageKind, FieldConfidence } from "@/db/schema";

/* --------------------------------------------------------------- confidence */

/** Matched against its printed label on the form. */
const C_LABELLED = 96;
/** Matched by a well-formed pattern in the expected column. */
const C_PATTERN = 92;
/** Read from a date in an unambiguous format. */
const C_DATE = 94;
/** A two-digit year, or a date whose day/month order had to be assumed. */
const C_DATE_WEAK = 68;
/** A checkbox column read as Y/N. */
const C_CHECKBOX = 90;
/** A value inferred from position rather than a label. */
const C_INFERRED = 74;
/** Not found. The value is null and the certificate goes to review. */
const C_ABSENT = 0;

export interface ExtractedCoverage {
  kind: CoverageKind;
  label: string;
  limitCents: number | null;
  policyNumber: string | null;
  effectiveOn: string | null;
  expiresOn: string | null;
  additionalInsured: boolean | null;
  waiverOfSubrogation: boolean | null;
  /** Per-field confidence, 0–100. */
  fieldConfidence: FieldConfidence;
}

export interface ExtractedCertificate {
  carrier: string | null;
  producer: string | null;
  holder: string | null;
  fieldConfidence: FieldConfidence;
  lines: ExtractedCoverage[];
}

/* -------------------------------------------------------------------- dates */

/** MM/DD/YYYY, MM-DD-YY, YYYY-MM-DD → ISO plus a confidence. */
export function parseAcordDate(raw: string | null | undefined): {
  iso: string | null;
  confidence: number;
} {
  if (!raw) return { iso: null, confidence: C_ABSENT };
  const text = raw.trim();

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) return { iso: text, confidence: C_DATE };

  const us = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(text);
  if (us) {
    const month = Number(us[1]);
    const day = Number(us[2]);
    let year = Number(us[3]);
    let confidence = C_DATE;
    if (us[3].length === 2) {
      // ACORD prints a 2-digit year in some agency systems. The century has to be
      // assumed, so the field is downgraded and a human sees it.
      year += year < 70 ? 2000 : 1900;
      confidence = C_DATE_WEAK;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return { iso: null, confidence: C_ABSENT };
    }
    const pad = (n: number) => String(n).padStart(2, "0");
    return { iso: `${year}-${pad(month)}-${pad(day)}`, confidence };
  }

  return { iso: null, confidence: C_ABSENT };
}

const DATE_TOKEN = /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/g;

/* ------------------------------------------------------------------ policy */

/**
 * A policy number: one token of letters, digits, dashes and slashes carrying both
 * a letter and a digit — `GL-4471-22`, `CA8890011`, `UMB/2210-A`. Space-separated
 * policy numbers ("WC 5512 00") are read as their first token only, which is a
 * stated limitation rather than a guess: the reviewer sees the field and the PDF
 * side by side.
 */
const POLICY_TOKEN = /\b([A-Z0-9]+(?:[-/][A-Z0-9]+)*)\b/g;

function findPolicyNumber(line: string): { value: string | null; confidence: number } {
  const explicit = /POLICY\s*(?:NUMBER|NO\.?|#)\s*[:.]?\s*([A-Z0-9][A-Z0-9/-]{4,})/i.exec(line);
  if (explicit) {
    return { value: explicit[1].trim(), confidence: C_LABELLED };
  }
  // Strip anything that is a date, a money amount or a column flag first.
  const cleaned = line
    .replace(DATE_TOKEN, " ")
    .replace(/\$\s?[\d,]+(?:\.\d+)?/g, " ")
    .replace(/\b(?:ADDL|INSD|SUBR|WVD)\b/gi, " ");
  const candidates: string[] = [];
  for (const m of cleaned.matchAll(POLICY_TOKEN)) {
    const token = m[1].trim();
    if (token.length < 6) continue;
    // A policy number always carries both a letter and a digit.
    if (!/[A-Z]/.test(token) || !/\d/.test(token)) continue;
    candidates.push(token);
  }
  if (!candidates.length) return { value: null, confidence: C_ABSENT };
  // The longest candidate is the policy number; short ones are column artefacts.
  candidates.sort((a, b) => b.length - a.length);
  return { value: candidates[0], confidence: C_PATTERN };
}

/* ---------------------------------------------------------------- sections */

interface SectionSpec {
  id: "gl" | "auto" | "umbrella" | "wc";
  /** Matches the "TYPE OF INSURANCE" cell that opens the block. */
  head: RegExp;
  /** Limit labels inside the block, in the order ACORD prints them. */
  limits: Array<{ kind: CoverageKind; label: RegExp }>;
  /** The limit a bare amount in this block is assumed to be. */
  fallback: CoverageKind;
}

const SECTIONS: SectionSpec[] = [
  {
    id: "gl",
    head: /\b(COMMERCIAL\s+GENERAL\s+LIABILITY|GENERAL\s+LIABILITY)\b/i,
    limits: [
      { kind: "gl_each_occurrence", label: /\bEACH\s+OCCURRENCE\b/i },
      { kind: "gl_aggregate", label: /\bGENERAL\s+AGGREGATE\b/i },
    ],
    fallback: "gl_each_occurrence",
  },
  {
    id: "auto",
    head: /\b(AUTOMOBILE\s+LIABILITY|AUTO\s+LIABILITY|BUSINESS\s+AUTO)\b/i,
    limits: [
      {
        kind: "auto_combined",
        label: /\b(COMBINED\s+SINGLE\s+LIMIT|CSL|BODILY\s+INJURY\s+AND\s+PROPERTY\s+DAMAGE)\b/i,
      },
    ],
    fallback: "auto_combined",
  },
  {
    id: "umbrella",
    head: /\b(UMBRELLA\s+LIAB|EXCESS\s+LIAB|UMBRELLA\s+LIABILITY)\b/i,
    limits: [{ kind: "umbrella_each", label: /\bEACH\s+OCCURRENCE\b/i }],
    fallback: "umbrella_each",
  },
  {
    id: "wc",
    head: /\b(WORKERS?['’]?\s*COMP(?:ENSATION)?|WORKERS\s+COMPENSATION)\b/i,
    limits: [{ kind: "wc_each_accident", label: /\b(E\.?\s*L\.?\s*)?EACH\s+ACCIDENT\b/i }],
    fallback: "wc_each_accident",
  },
];

/** Where the coverage table stops and the form's prose begins. */
const BLOCK_TERMINATOR =
  /^(DESCRIPTION\s+OF\s+OPERATIONS|CERTIFICATE\s+HOLDER|CANCELLATION|AUTHORIZED\s+REPRESENTATIVE|SHOULD\s+ANY)/i;

/** The ADDL INSD / SUBR WVD columns, printed as Y / N / X or left blank. */
function readCheckboxes(line: string): {
  additionalInsured: boolean | null;
  waiverOfSubrogation: boolean | null;
  confidence: { additionalInsured: number; waiverOfSubrogation: number };
} {
  const labelled = (label: RegExp): boolean | null => {
    const m = label.exec(line);
    if (!m) return null;
    const flag = m[1]?.trim().toUpperCase();
    if (flag === "Y" || flag === "X") return true;
    if (flag === "N") return false;
    return null;
  };

  const ai = labelled(/ADDL\s*INSD?\s*[:=]?\s*([YNX])\b/i);
  const wos = labelled(/SUBR\s*WVD\s*[:=]?\s*([YNX])\b/i);
  if (ai !== null || wos !== null) {
    return {
      additionalInsured: ai,
      waiverOfSubrogation: wos,
      confidence: {
        additionalInsured: ai === null ? C_ABSENT : C_LABELLED,
        waiverOfSubrogation: wos === null ? C_ABSENT : C_LABELLED,
      },
    };
  }

  // Unlabelled columns: two Y/N flags sitting between the policy type and the
  // policy number, which is how the printed form lays them out. Inferred from
  // position, so scored lower than a labelled read.
  const pair = /\b([YN])\s+([YN])\b/.exec(line);
  if (pair) {
    return {
      additionalInsured: pair[1].toUpperCase() === "Y",
      waiverOfSubrogation: pair[2].toUpperCase() === "Y",
      confidence: { additionalInsured: C_CHECKBOX, waiverOfSubrogation: C_CHECKBOX },
    };
  }

  return {
    additionalInsured: null,
    waiverOfSubrogation: null,
    confidence: { additionalInsured: C_ABSENT, waiverOfSubrogation: C_ABSENT },
  };
}

/** Money amounts on a line, with the label that precedes each one. */
function readLimits(line: string, spec: SectionSpec): Array<{ kind: CoverageKind; cents: number; confidence: number }> {
  const found: Array<{ kind: CoverageKind; cents: number; confidence: number }> = [];
  const money = /\$\s?([\d,]+(?:\.\d{2})?)/g;
  for (const m of line.matchAll(money)) {
    const cents = parseLimitToCents(m[1]);
    if (cents == null) continue;
    const before = line.slice(0, m.index ?? 0);
    const labelled = spec.limits.find((l) => l.label.test(before));
    if (labelled) {
      found.push({ kind: labelled.kind, cents, confidence: C_LABELLED });
    } else {
      found.push({ kind: spec.fallback, cents, confidence: C_INFERRED });
    }
  }
  return found;
}

/* ---------------------------------------------------------------- headers */

function readHeaderField(lines: string[], patterns: RegExp[]): { value: string | null; confidence: number } {
  for (const pattern of patterns) {
    for (let i = 0; i < lines.length; i++) {
      const m = pattern.exec(lines[i]);
      if (!m) continue;
      const inline = m[1]?.trim();
      if (inline && inline.length > 2) {
        return { value: cleanName(inline), confidence: C_LABELLED };
      }
      // The label is on its own line; the value is the next non-empty line that is
      // not another label.
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const candidate = lines[j];
        if (!candidate || isLabelLine(candidate)) continue;
        return { value: cleanName(candidate), confidence: C_INFERRED };
      }
    }
  }
  return { value: null, confidence: C_ABSENT };
}

const LABEL_WORDS =
  /^(PRODUCER|INSURED|INSURER|CONTACT|PHONE|FAX|E-?MAIL|ADDRESS|COVERAGES|TYPE OF INSURANCE|CERTIFICATE|LIMITS|POLICY|ADDL|SUBR|NAIC|AUTHORIZED REPRESENTATIVE|DESCRIPTION OF OPERATIONS|THIS CERTIFICATE|IMPORTANT|SHOULD ANY|DATE)\b/i;

function isLabelLine(line: string): boolean {
  return LABEL_WORDS.test(line.trim());
}

function cleanName(raw: string): string {
  return raw
    .replace(/^[:\-\s]+/, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[|]+/g, " ")
    .trim()
    .slice(0, 160);
}

/* --------------------------------------------------------------- extraction */

export function extractFromText(rawText: string): ExtractedCertificate {
  const lines = normaliseLines(rawText);

  const producer = readHeaderField(lines, [/^PRODUCER\s*[:.]?\s*(.*)$/i]);
  const carrier = readHeaderField(lines, [
    /^INSURER\s+[A-F]\s*[:.]?\s*(.*)$/i,
    /^INSURER\s*[:.]?\s*(.*)$/i,
    /^CARRIER\s*[:.]?\s*(.*)$/i,
  ]);
  const holder = readHeaderField(lines, [/^CERTIFICATE\s+HOLDER\s*[:.]?\s*(.*)$/i]);

  // Walk the policy blocks. A block opens on the line naming its type of
  // insurance and runs until the next such line.
  interface Block {
    spec: SectionSpec;
    lines: string[];
  }
  const blocks: Block[] = [];
  let tableOpen = true;
  for (const line of lines) {
    // The terminator is checked FIRST. The description-of-operations box routinely
    // contains the words "general liability", and treating that as a new policy
    // block invented a fifth coverage row with every field at zero — which then
    // dragged a perfectly readable certificate into the review queue.
    if (blocks.length && BLOCK_TERMINATOR.test(line)) {
      tableOpen = false;
      continue;
    }
    if (!tableOpen) continue;
    const spec = SECTIONS.find((s) => s.head.test(line));
    if (spec) {
      blocks.push({ spec, lines: [line] });
      continue;
    }
    if (blocks.length) blocks[blocks.length - 1].lines.push(line);
  }

  const out: ExtractedCoverage[] = [];

  for (const block of blocks) {
    const head = block.lines[0];
    const body = block.lines.join(" ");

    const checkboxes = readCheckboxes(head);
    const policy = findPolicyNumber(head);

    const dateTokens = [...head.matchAll(DATE_TOKEN)].map((m) => m[1]);
    const effective = parseAcordDate(dateTokens[0]);
    const expires = parseAcordDate(dateTokens[1]);

    // Limits can be on the head line or on continuation lines inside the block.
    const limitHits: Array<{ kind: CoverageKind; cents: number; confidence: number }> = [];
    for (const line of block.lines) {
      // Never read a following policy block's line: blocks are already split.
      limitHits.push(...readLimits(line, block.spec));
    }

    // One coverage row per distinct limit kind. The highest-confidence hit wins,
    // and ties go to the larger amount (a form that prints both an occurrence and
    // an aggregate under one label).
    const byKind = new Map<CoverageKind, { cents: number; confidence: number }>();
    for (const hit of limitHits) {
      const prev = byKind.get(hit.kind);
      if (
        !prev ||
        hit.confidence > prev.confidence ||
        (hit.confidence === prev.confidence && hit.cents > prev.cents)
      ) {
        byKind.set(hit.kind, { cents: hit.cents, confidence: hit.confidence });
      }
    }

    // A block that names a policy but shows no limit still produces a row: the
    // engine has to be able to say "carries no limit on this certificate".
    if (!byKind.size) {
      byKind.set(block.spec.fallback, { cents: Number.NaN, confidence: C_ABSENT });
    }

    for (const [kind, limit] of byKind) {
      const limitCents = Number.isFinite(limit.cents) ? limit.cents : null;
      const fieldConfidence: FieldConfidence = {
        limitCents: limit.confidence,
        policyNumber: policy.confidence,
        effectiveOn: effective.confidence,
        expiresOn: expires.confidence,
        additionalInsured: checkboxes.confidence.additionalInsured,
        waiverOfSubrogation: checkboxes.confidence.waiverOfSubrogation,
      };
      out.push({
        kind,
        label: COVERAGE_LABELS[kind],
        limitCents,
        policyNumber: policy.value,
        effectiveOn: effective.iso,
        expiresOn: expires.iso,
        additionalInsured: checkboxes.additionalInsured,
        waiverOfSubrogation: checkboxes.waiverOfSubrogation,
        fieldConfidence,
      });
      void body;
    }
  }

  return {
    carrier: carrier.value,
    producer: producer.value,
    holder: holder.value,
    fieldConfidence: {
      carrier: carrier.confidence,
      producer: producer.confidence,
      holder: holder.confidence,
    },
    lines: out,
  };
}

/* ------------------------------------------------------------ review gating */

/**
 * The lowest confidence on a coverage row — the row-level summary stored in
 * `coverages.confidence`. Fields that are legitimately absent on a valid form
 * (AI / WOS when the requirement does not ask for them) still count: the reviewer
 * is the one who decides an empty checkbox is fine.
 */
export function rowConfidence(row: ExtractedCoverage): number {
  const values = Object.values(row.fieldConfidence);
  return values.length ? Math.min(...values) : 0;
}

/** Every field below the threshold, named for the review queue's highlighting. */
export function lowConfidenceFields(
  cert: ExtractedCertificate,
  threshold: number,
): Array<{ scope: string; field: string; confidence: number }> {
  const out: Array<{ scope: string; field: string; confidence: number }> = [];
  for (const [field, confidence] of Object.entries(cert.fieldConfidence)) {
    if (confidence < threshold) out.push({ scope: "certificate", field, confidence });
  }
  cert.lines.forEach((line, i) => {
    for (const [field, confidence] of Object.entries(line.fieldConfidence)) {
      if (confidence < threshold) out.push({ scope: `line:${i}:${line.kind}`, field, confidence });
    }
  });
  return out;
}

/** Does this extraction clear the bar to enter compliance unreviewed? */
export function needsReview(cert: ExtractedCertificate, threshold: number): boolean {
  return lowConfidenceFields(cert, threshold).length > 0;
}

/**
 * Does the certificate name the org as holder? A loose comparison on purpose —
 * agents type "Harbor Ridge Mgmt, LLC" for "Harbor Ridge Management LLC" — but it
 * only ever returns true on a real overlap, and null when there is nothing to
 * compare, so the engine reports "could not be read" rather than assuming a match.
 */
export function holderMatches(found: string | null, expected: string | null): boolean | null {
  if (!found || !expected) return null;
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/\b(llc|l\.l\.c|inc|incorporated|corp|corporation|co|company|ltd|lp|llp|mgmt|management|group|properties|property)\b/g, " ")
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const a = norm(found);
  const b = norm(expected);
  if (!a || !b) return null;
  if (a === b) return true;
  const aWords = new Set(a.split(" ").filter((w) => w.length > 2));
  const bWords = b.split(" ").filter((w) => w.length > 2);
  if (!bWords.length || !aWords.size) return null;
  const overlap = bWords.filter((w) => aWords.has(w)).length;
  return overlap / bWords.length >= 0.6;
}
