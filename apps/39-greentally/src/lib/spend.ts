/**
 * The spend pipeline: a GL export in, a classified Scope 3 screen out.
 *
 * Three jobs, in order:
 *
 *  1. **Mapping.** A GL export names its columns whatever the accounting package
 *     felt like. `guessMapping` proposes the four that matter and the operator
 *     confirms them; the confirmed mapping is saved on the org so the second import
 *     is one click.
 *  2. **Exclusion.** Payroll, taxes, depreciation, intra-company transfers and loan
 *     repayments are not purchases of goods or services and must not be multiplied by
 *     a spend factor. Neither must electricity or fuel, which Scope 1 and 2 already
 *     measured from the bills — that one is the double-count nobody notices, and it
 *     inflates a footprint by 10–20%. Every exclusion carries its reason and stays
 *     visible; nothing is silently dropped.
 *  3. **Classification.** Deterministic keyword rules first, because they are free,
 *     explainable and reproducible. Whatever the rules cannot place is offered to the
 *     model in one batch; without a key those lines simply arrive unclassified and
 *     the operator assigns them, which is a working product, not a degraded one.
 *
 * Money is integer cents, parsed once, here.
 */

import { parse } from "csv-parse/sync";
import { z } from "zod";
import { EEIO_BY_SLUG, EEIO_CATEGORIES } from "@/db/factors";
import { env } from "@/lib/env";
import { ValidationError } from "@/lib/errors";

export interface SpendMapping {
  description: string;
  amount: string;
  glAccount: string;
  date: string;
}

export interface ParsedSpendRow {
  rowNumber: number;
  description: string;
  amountCents: number;
  glAccount: string;
  spendDate: string | null;
}

export interface ParsedSpendFile {
  headers: string[];
  /** Up to five rows, for the mapping preview. */
  sample: Record<string, string>[];
  rowCount: number;
}

/* -------------------------------------------------------------------- money --- */

/**
 * "$1,248.00", "(430.19)", "1248", "1 248,00" → integer cents.
 *
 * Parentheses are accounting-speak for negative, which in a GL export is a credit or
 * a refund. A credit reduces spend; it is kept with its sign so the totals are honest,
 * and the engine ignores non-positive lines.
 */
export function parseAmountToCents(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  s = s.replace(/[$£€\s]/g, "");
  // European style: 1.248,00 — a comma with exactly two digits after it and a dot
  // used as the thousands separator.
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  if (!/^\d+(\.\d{1,6})?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  if (!Number.isFinite(cents)) return null;
  return negative ? -cents : cents;
}

/* ------------------------------------------------------------------ parsing --- */

export function readCsvHeaders(text: string): ParsedSpendFile {
  const rows = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true,
  }) as Record<string, string>[];
  if (rows.length === 0) throw new ValidationError("That CSV has a header row but no data rows.");
  const headers = Object.keys(rows[0]).filter((h) => h.length > 0);
  if (headers.length < 2) {
    throw new ValidationError(
      "That file does not look like a CSV export — only one column was found. Check the delimiter.",
    );
  }
  return { headers, sample: rows.slice(0, 5), rowCount: rows.length };
}

const HEADER_HINTS: Record<keyof SpendMapping, RegExp[]> = {
  description: [/^description$/i, /memo/i, /narrative/i, /details?/i, /payee/i, /vendor/i, /supplier/i, /name/i],
  amount: [/^amount$/i, /^debit$/i, /net/i, /total/i, /value/i, /^amt/i],
  glAccount: [/account/i, /^gl/i, /category/i, /class/i, /code/i],
  date: [/^date$/i, /posted/i, /transaction date/i, /^txn/i],
};

/** Propose a mapping from the headers. The operator confirms it; nothing is silent. */
export function guessMapping(headers: string[]): SpendMapping {
  const pick = (field: keyof SpendMapping): string => {
    for (const re of HEADER_HINTS[field]) {
      const hit = headers.find((h) => re.test(h));
      if (hit) return hit;
    }
    return "";
  };
  return {
    description: pick("description"),
    amount: pick("amount"),
    glAccount: pick("glAccount"),
    date: pick("date"),
  };
}

export function parseSpendCsv(text: string, mapping: SpendMapping): ParsedSpendRow[] {
  if (!mapping.description || !mapping.amount) {
    throw new ValidationError("Choose which columns hold the description and the amount.");
  }
  const rows = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true,
  }) as Record<string, string>[];

  const out: ParsedSpendRow[] = [];
  let unparseable = 0;
  rows.forEach((row, idx) => {
    const description = (row[mapping.description] ?? "").trim();
    const amountCents = parseAmountToCents(row[mapping.amount] ?? "");
    if (amountCents === null) {
      unparseable += 1;
      return;
    }
    if (!description && amountCents === 0) return;
    out.push({
      rowNumber: idx + 2, // +2: one-based, plus the header row, so it matches the file
      description: description || "(no description)",
      amountCents,
      glAccount: (mapping.glAccount ? row[mapping.glAccount] : "")?.trim() ?? "",
      spendDate: normalizeDate(mapping.date ? row[mapping.date] : ""),
    });
  });

  if (out.length === 0) {
    throw new ValidationError(
      `No row in that file had a readable amount in the "${mapping.amount}" column. Check the column choice.`,
    );
  }
  if (unparseable > out.length) {
    throw new ValidationError(
      `${unparseable} of ${rows.length} rows had an unreadable amount in "${mapping.amount}". That is probably the wrong column.`,
    );
  }
  return out;
}

function normalizeDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    const [mo, d] = a > 12 ? [b, a] : [a, b];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${m[3]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return null;
}

/* --------------------------------------------------------------- exclusions --- */

export interface ExclusionRule {
  reason: string;
  test: RegExp;
}

/**
 * Lines that are not purchases of goods or services, or that Scope 1 and 2 already
 * counted. Order matters only in that the first match wins; the reasons are what the
 * operator reads on the review table.
 */
export const EXCLUSION_RULES: ExclusionRule[] = [
  { reason: "Payroll — employee compensation is not a purchased good or service", test: /payroll|salar|wage|pension contribution|401\(?k\)?|national insurance|paye/i },
  { reason: "Tax — a transfer, not a purchase", test: /\btax(es)?\b|\bvat\b|corporation tax|sales tax|use tax|hmrc|irs payment/i },
  { reason: "Depreciation — a non-cash accounting entry", test: /depreciation|amorti[sz]ation|impairment/i },
  { reason: "Intra-company transfer — would double-count inside the boundary", test: /inter[- ]?company|intra[- ]?company|transfer to|owner draw|drawings|dividend/i },
  { reason: "Financing — principal and interest are not purchases", test: /loan (?:re)?payment|principal|interest (?:expense|payment)|mortgage|lease principal/i },
  { reason: "Already counted in Scope 2 from the electricity bills", test: /^(?=.*\b(electric|electricity|power)\b)(?!.*\b(tools?|motor rewind)\b)/i },
  { reason: "Already counted in Scope 1 from the gas bills", test: /natural gas|gas utility|gas bill|british gas|peoples gas|southwest gas/i },
  { reason: "Already counted in Scope 1 from the fuel receipts", test: /\b(diesel|petrol|gasoline|fuel card|heating oil|propane)\b/i },
];

export function exclusionFor(description: string, glAccount = ""): string | null {
  const haystack = `${description} ${glAccount}`;
  for (const rule of EXCLUSION_RULES) {
    if (rule.test.test(haystack)) return rule.reason;
  }
  return null;
}

/* ------------------------------------------------------------ classification --- */

export interface Classification {
  eeioCategory: string | null;
  confidenceBp: number;
  reason: string;
  excluded: boolean;
  exclusionReason: string;
}

/**
 * The deterministic classifier.
 *
 * Longest keyword wins, so "equipment rental" beats "equipment" and "natural gas"
 * beats "gas". Confidence reflects how much of the description the keyword accounted
 * for: a two-word description matched by a two-word keyword is a strong signal; the
 * same keyword inside a fifty-character memo is weaker.
 */
export function classifyLine(description: string, glAccount = ""): Classification {
  const excluded = exclusionFor(description, glAccount);
  if (excluded) {
    // A recognised-then-excluded line still gets its category, so the review table can
    // show what it was and why it is not in the total.
    const cat = keywordMatch(`${description} ${glAccount}`);
    return {
      eeioCategory: cat?.slug ?? null,
      confidenceBp: cat ? cat.confidenceBp : 0,
      reason: cat ? `Matched "${cat.keyword}"` : "",
      excluded: true,
      exclusionReason: excluded,
    };
  }

  const cat = keywordMatch(`${description} ${glAccount}`);
  if (!cat) {
    return {
      eeioCategory: null,
      confidenceBp: 0,
      reason: "No keyword rule matched — assign a category",
      excluded: false,
      exclusionReason: "",
    };
  }
  const category = EEIO_BY_SLUG.get(cat.slug);
  if (category?.alreadyCounted) {
    return {
      eeioCategory: cat.slug,
      confidenceBp: cat.confidenceBp,
      reason: `Matched "${cat.keyword}"`,
      excluded: true,
      exclusionReason: `Already counted in Scope 1/2 — ${category.label}`,
    };
  }
  return {
    eeioCategory: cat.slug,
    confidenceBp: cat.confidenceBp,
    reason: `Matched "${cat.keyword}"`,
    excluded: false,
    exclusionReason: "",
  };
}

const KEYWORDS: { keyword: string; slug: string }[] = EEIO_CATEGORIES.flatMap((c) =>
  c.keywords.map((k) => ({ keyword: k, slug: c.slug })),
).sort((a, b) => b.keyword.length - a.keyword.length);

function keywordMatch(text: string): { slug: string; keyword: string; confidenceBp: number } | null {
  const hay = ` ${text.toLowerCase().replace(/\s+/g, " ")} `;
  for (const { keyword, slug } of KEYWORDS) {
    const needle = keyword.endsWith(" ") ? keyword : ` ${keyword}`;
    const idx = hay.indexOf(needle);
    if (idx === -1) continue;
    const share = keyword.trim().length / Math.max(1, hay.trim().length);
    const confidenceBp = share > 0.6 ? 9_400 : share > 0.3 ? 8_600 : 7_600;
    return { slug, keyword: keyword.trim(), confidenceBp };
  }
  return null;
}

/* ------------------------------------------------------- model classification --- */

const suggestionSchema = z.object({
  suggestions: z.array(
    z.object({
      row: z.number().int(),
      category: z.string(),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

export interface ModelSuggestion {
  rowNumber: number;
  eeioCategory: string;
  confidenceBp: number;
}

export interface Classifier {
  readonly name: string;
  suggest(
    lines: { rowNumber: number; description: string; glAccount: string }[],
  ): Promise<{ ok: true; suggestions: ModelSuggestion[] } | { ok: false; message: string }>;
}

export function classifierSystemPrompt(): string {
  return [
    "You map general-ledger spend descriptions to USEEIO spend categories for a Scope 3 screening estimate.",
    "",
    `Categories you may use, and only these: ${EEIO_CATEGORIES.map((c) => c.slug).join(", ")}.`,
    "",
    "Rules:",
    "- Omit a row entirely rather than guessing. An unassigned row is reviewed by a human; a wrongly assigned one silently changes a reported figure.",
    "- Confidence is your honest probability that the category is right for that description.",
    "- Never invent a category slug. Never return a row number you were not given.",
    "- Call record_suggestions exactly once.",
  ].join("\n");
}

export function anthropicClassifier(): Classifier {
  return {
    name: "anthropic",
    async suggest(lines) {
      if (lines.length === 0) return { ok: true, suggestions: [] };
      try {
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        const client = new Anthropic({ apiKey: env.anthropicApiKey, maxRetries: 2 });
        const payload = lines
          .slice(0, 200)
          .map((l) => `${l.rowNumber}\t${l.description}\t${l.glAccount}`)
          .join("\n");
        const response = await client.messages.create(
          {
            model: env.extractionModel,
            max_tokens: 4096,
            system: classifierSystemPrompt(),
            tools: [
              {
                name: "record_suggestions",
                description: "Record a category suggestion for each row you are confident about.",
                input_schema: {
                  type: "object",
                  properties: {
                    suggestions: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          row: { type: "integer" },
                          category: { type: "string" },
                          confidence: { type: "number" },
                        },
                        required: ["row", "category", "confidence"],
                      },
                    },
                  },
                  required: ["suggestions"],
                } as never,
              },
            ],
            tool_choice: { type: "tool", name: "record_suggestions" },
            messages: [
              { role: "user", content: `row\tdescription\tgl_account\n${payload}` },
            ],
          },
          { timeout: 90_000 },
        );
        const block = response.content.find((c) => c.type === "tool_use");
        if (!block) return { ok: false, message: "The model did not return suggestions." };
        const parsed = suggestionSchema.safeParse((block as { input: unknown }).input);
        if (!parsed.success) return { ok: false, message: "The model's suggestions did not validate." };
        return { ok: true, suggestions: validateSuggestions(parsed.data.suggestions, lines) };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

/**
 * Drop anything the model made up: an unknown category slug, a row number it was not
 * given, a duplicate. This is the guard that stops a hallucinated category from
 * quietly becoming a reported figure.
 */
export function validateSuggestions(
  suggestions: { row: number; category: string; confidence: number }[],
  lines: { rowNumber: number }[],
): ModelSuggestion[] {
  const known = new Set(lines.map((l) => l.rowNumber));
  const seen = new Set<number>();
  const out: ModelSuggestion[] = [];
  for (const s of suggestions) {
    if (!known.has(s.row) || seen.has(s.row)) continue;
    const category = EEIO_BY_SLUG.get(s.category);
    if (!category || category.alreadyCounted) continue;
    seen.add(s.row);
    out.push({
      rowNumber: s.row,
      eeioCategory: s.category,
      confidenceBp: Math.max(0, Math.min(10_000, Math.round(s.confidence * 10_000))),
    });
  }
  return out;
}

let _classifierOverride: Classifier | null = null;

export function setClassifier(c: Classifier | null): void {
  _classifierOverride = c;
}

export function getClassifier(): Classifier | null {
  if (_classifierOverride) return _classifierOverride;
  return env.anthropicApiKey ? anthropicClassifier() : null;
}

/* ------------------------------------------------------------------ summary --- */

export interface SpendSummary {
  rows: number;
  includedRows: number;
  excludedRows: number;
  unclassifiedRows: number;
  includedCents: number;
  excludedCents: number;
  byReason: { reason: string; rows: number; cents: number }[];
}

export function summarise(
  lines: { amountCents: number; eeioCategory: string | null; excluded: boolean; exclusionReason: string }[],
): SpendSummary {
  const byReason = new Map<string, { rows: number; cents: number }>();
  let includedCents = 0;
  let excludedCents = 0;
  let includedRows = 0;
  let excludedRows = 0;
  let unclassifiedRows = 0;

  for (const l of lines) {
    if (l.excluded) {
      excludedRows += 1;
      excludedCents += l.amountCents;
      const key = l.exclusionReason || "Excluded";
      const cur = byReason.get(key) ?? { rows: 0, cents: 0 };
      byReason.set(key, { rows: cur.rows + 1, cents: cur.cents + l.amountCents });
      continue;
    }
    if (!l.eeioCategory) {
      unclassifiedRows += 1;
      continue;
    }
    includedRows += 1;
    includedCents += l.amountCents;
  }

  return {
    rows: lines.length,
    includedRows,
    excludedRows,
    unclassifiedRows,
    includedCents,
    excludedCents,
    byReason: [...byReason.entries()]
      .map(([reason, v]) => ({ reason, ...v }))
      .sort((a, b) => b.cents - a.cents),
  };
}
