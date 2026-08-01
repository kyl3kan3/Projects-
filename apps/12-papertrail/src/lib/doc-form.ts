/**
 * The shape the proposal builder posts, and the translation between that shape
 * and document blocks.
 *
 * Kept out of the server-action file so the client component can import the
 * types, and kept as strings on the wire so the form can round-trip exactly what
 * somebody typed (including "1,200.50") and report a precise error instead of
 * silently billing zero.
 */

import { z } from "zod";
import type { BlockContent, DocBlock, LineItem } from "@/db/schema";
import { CURRENCIES, computeTotals, formatMoney, parseMoneyInput, parseTaxPercent } from "@/lib/money";

export interface DocFormLine {
  id: string;
  description: string;
  quantity: string;
  unitAmount: string;
  optional: boolean;
  taxable: boolean;
}

export interface DocFormClause {
  heading: string;
  body: string;
}

export interface DocFormValues {
  clientId: string | null;
  clientName: string;
  clientEmail: string;
  clientCompany: string;
  title: string;
  currency: string;
  taxPercent: string;
  taxLabel: string;
  depositPercent: string;
  netDays: string;
  headline: string;
  scope: string;
  caption: string;
  lines: DocFormLine[];
  clauses: DocFormClause[];
}

export const CURRENCY_CODES = Object.keys(CURRENCIES);
export const NET_TERMS = [0, 7, 14, 30] as const;
export const DEPOSIT_CHOICES = [0, 25, 33, 40, 50] as const;

const lineSchema = z.object({
  id: z.string().min(1),
  description: z.string().trim().min(1, "Every priced line needs a description"),
  quantity: z.string(),
  unitAmount: z.string(),
  optional: z.boolean(),
  taxable: z.boolean(),
});

export const docFormSchema = z.object({
  clientId: z.string().uuid().nullable(),
  clientName: z.string().trim().min(1, "Who is this for?"),
  clientEmail: z.string().trim().email("Enter the client's email address"),
  clientCompany: z.string().trim(),
  title: z.string().trim().min(3, "Give the document a title the client will recognise"),
  currency: z.enum(["USD", "EUR", "GBP", "CAD", "AUD", "JPY"]),
  taxPercent: z.string(),
  taxLabel: z.string().trim().max(24),
  depositPercent: z.string(),
  netDays: z.string(),
  headline: z.string().trim().max(120),
  scope: z.string().trim(),
  caption: z.string().trim().max(60),
  lines: z.array(lineSchema).min(1, "A proposal needs at least one priced line"),
  clauses: z.array(z.object({ heading: z.string().trim(), body: z.string().trim() })),
});

export interface ParsedDocForm {
  clientId: string | null;
  clientName: string;
  clientEmail: string;
  clientCompany: string;
  title: string;
  currency: string;
  taxRateBps: number;
  taxLabel: string;
  depositPercent: number;
  netDays: number;
  blocks: { kind: DocBlock["kind"]; position: number; content: BlockContent }[];
  total: number;
}

export interface ParseResult {
  ok: boolean;
  error?: string;
  value?: ParsedDocForm;
}

/** Validate and convert the posted form into document blocks. */
export function parseDocForm(input: unknown): ParseResult {
  const parsed = docFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
  }
  const v = parsed.data;

  const taxRateBps = parseTaxPercent(v.taxPercent);
  if (taxRateBps === null) return { ok: false, error: "Tax rate should be a percentage, like 20" };

  const depositPercent = Math.min(100, Math.max(0, Math.round(Number(v.depositPercent) || 0)));
  const netDays = Math.min(120, Math.max(0, Math.round(Number(v.netDays) || 0)));

  const lines: LineItem[] = [];
  for (const line of v.lines) {
    const unitAmount = parseMoneyInput(line.unitAmount, v.currency);
    if (unitAmount === null) {
      return { ok: false, error: `"${line.description}" needs a price, like 1200` };
    }
    if (unitAmount < 0) return { ok: false, error: "Prices cannot be negative" };
    const quantity = Number(String(line.quantity).replace(/,/g, ""));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { ok: false, error: `"${line.description}" needs a quantity above zero` };
    }
    lines.push({
      id: line.id,
      description: line.description,
      quantity: Math.round(quantity * 1000) / 1000,
      unitAmount,
      optional: line.optional,
      selected: !line.optional,
      taxable: line.taxable,
    });
  }

  const blocks: { kind: DocBlock["kind"]; position: number; content: BlockContent }[] = [];
  let position = 0;
  if (v.headline) {
    blocks.push({ kind: "heading", position: position++, content: { kind: "heading", text: v.headline } });
  }
  if (v.scope) {
    blocks.push({ kind: "text", position: position++, content: { kind: "text", body: v.scope } });
  }
  blocks.push({
    kind: "pricing_table",
    position: position++,
    content: { kind: "pricing_table", caption: v.caption || "Fees", lines },
  });
  const clauses = v.clauses.filter((c) => c.heading || c.body);
  if (clauses.length) {
    blocks.push({ kind: "terms", position: position++, content: { kind: "terms", clauses } });
  }

  return {
    ok: true,
    value: {
      clientId: v.clientId,
      clientName: v.clientName,
      clientEmail: v.clientEmail.toLowerCase(),
      clientCompany: v.clientCompany,
      title: v.title,
      currency: v.currency,
      taxRateBps,
      taxLabel: v.taxLabel || "Tax",
      depositPercent,
      netDays,
      blocks,
      total: computeTotals(lines, taxRateBps).total,
    },
  };
}

/** Turn an existing draft back into form values, for editing. */
export function docFormFromBlocks(args: {
  blocks: Pick<DocBlock, "kind" | "content">[];
  document: {
    title: string;
    currency: string;
    taxRateBps: number;
    taxLabel: string;
    depositPercent: number;
    netDays: number;
  };
  client: { id: string; name: string; email: string; company: string | null };
}): DocFormValues {
  const heading = args.blocks.find((b) => b.content.kind === "heading");
  const text = args.blocks.find((b) => b.content.kind === "text");
  const pricing = args.blocks.find((b) => b.content.kind === "pricing_table");
  const terms = args.blocks.find((b) => b.content.kind === "terms");

  return {
    clientId: args.client.id,
    clientName: args.client.name,
    clientEmail: args.client.email,
    clientCompany: args.client.company ?? "",
    title: args.document.title,
    currency: args.document.currency,
    taxPercent: args.document.taxRateBps ? String(args.document.taxRateBps / 100) : "0",
    taxLabel: args.document.taxLabel,
    depositPercent: String(args.document.depositPercent),
    netDays: String(args.document.netDays),
    headline: heading?.content.kind === "heading" ? heading.content.text : "",
    scope: text?.content.kind === "text" ? text.content.body : "",
    caption: pricing?.content.kind === "pricing_table" ? pricing.content.caption : "Fees",
    lines: formLines(args.blocks).map((line) => ({
      id: line.id,
      description: line.description,
      quantity: String(line.quantity),
      unitAmount: (line.unitAmount / (args.document.currency === "JPY" ? 1 : 100)).toString(),
      optional: line.optional,
      taxable: line.taxable,
    })),
    clauses: terms?.content.kind === "terms" ? terms.content.clauses : [],
  };
}

/**
 * The pricing rows of a block list. Duplicated from documents.ts on purpose:
 * this module is imported by a client component, and documents.ts reaches the
 * database.
 */
function formLines(blocks: Pick<DocBlock, "content">[]): LineItem[] {
  const out: LineItem[] = [];
  for (const block of blocks) {
    if (block.content?.kind === "pricing_table") out.push(...block.content.lines);
  }
  return out;
}

/** A human summary of what the form currently adds up to. */
export function describeFormTotal(lines: DocFormLine[], currency: string, taxPercent: string): string {
  const bps = parseTaxPercent(taxPercent) ?? 0;
  let subtotal = 0;
  let taxable = 0;
  for (const line of lines) {
    if (line.optional) continue;
    const unit = parseMoneyInput(line.unitAmount, currency);
    const qty = Number(String(line.quantity).replace(/,/g, ""));
    if (unit === null || !Number.isFinite(qty)) continue;
    const amount = Math.round(unit * qty);
    subtotal += amount;
    if (line.taxable) taxable += amount;
  }
  const tax = Math.round((taxable * bps) / 10_000);
  return formatMoney(subtotal + tax, currency);
}
