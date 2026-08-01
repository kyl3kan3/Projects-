/**
 * src/lib/blocks.ts
 *
 * The structured block system: what a block *is*, what it asks, what it validates,
 * and which CSV columns it owns.
 *
 * Blocks — not a drag-anything canvas — are what make a submission an exportable
 * record (README differentiation 3). Every block flattens to a list of `Field`
 * descriptors, and that one list drives four things at once: the patient's
 * screen, server-side validation, the EHR-lite CSV header, and the PDF layout.
 * One source of truth means the export can never drift from the form.
 *
 * Answers are a flat `Record<string, string>` keyed `"<blockKey>.<field>"`, which
 * is also the CSV column name. That is the EHR-lite contract: **column names are
 * stable, and changing one is a versioned event**, not a refactor.
 */

import { z } from "zod";
import { screenerDefinition, type Instrument } from "@/lib/screeners";
import type { BlockKind, FormBlock } from "@/db/schema";

/* ------------------------------------------------------------------ fields */

export type FieldKind =
  | "text"
  | "long_text"
  | "email"
  | "phone"
  | "date"
  | "yes_no"
  | "scale4"
  | "file"
  | "signature";

export interface Field {
  /** Answer key and CSV column: "demographics.first_name". */
  name: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  help?: string;
  /** For scale4 (screener items): the 0–3 option labels. */
  options?: { value: string; label: string }[];
}

export type AnswerMap = Record<string, string>;

/* ----------------------------------------------------------- block configs */

const demographicsFieldCatalog = [
  { key: "first_name", label: "First name", kind: "text" as FieldKind },
  { key: "last_name", label: "Last name", kind: "text" as FieldKind },
  { key: "preferred_name", label: "Preferred name", kind: "text" as FieldKind },
  { key: "dob", label: "Date of birth", kind: "date" as FieldKind },
  { key: "pronouns", label: "Pronouns", kind: "text" as FieldKind },
  { key: "phone", label: "Mobile phone", kind: "phone" as FieldKind },
  { key: "email", label: "Email", kind: "email" as FieldKind },
  { key: "address", label: "Home address", kind: "long_text" as FieldKind },
  { key: "emergency_name", label: "Emergency contact name", kind: "text" as FieldKind },
  { key: "emergency_phone", label: "Emergency contact phone", kind: "phone" as FieldKind },
  {
    key: "emergency_relationship",
    label: "Relationship to you",
    kind: "text" as FieldKind,
  },
] as const;

export type DemographicsFieldKey = (typeof demographicsFieldCatalog)[number]["key"];

const insuranceFieldCatalog = [
  { key: "self_pay", label: "Are you paying privately (no insurance)?", kind: "yes_no" as FieldKind },
  { key: "carrier", label: "Insurance carrier", kind: "text" as FieldKind },
  { key: "member_id", label: "Member ID", kind: "text" as FieldKind },
  { key: "group_number", label: "Group number", kind: "text" as FieldKind },
  { key: "subscriber_name", label: "Subscriber name", kind: "text" as FieldKind },
  {
    key: "subscriber_relationship",
    label: "Your relationship to the subscriber",
    kind: "text" as FieldKind,
  },
] as const;

export type InsuranceFieldKey = (typeof insuranceFieldCatalog)[number]["key"];

const fieldSelection = z.object({ key: z.string().min(1), required: z.boolean() });

export const demographicsConfigSchema = z.object({
  heading: z.string().min(1).default("About you"),
  fields: z.array(fieldSelection).min(1),
});

export const insuranceConfigSchema = z.object({
  heading: z.string().min(1).default("Insurance"),
  fields: z.array(fieldSelection).min(1),
});

export const historyQuestionSchema = z.object({
  key: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_]+$/, "Question keys are lowercase letters, digits and underscores"),
  label: z.string().min(1),
  kind: z.enum(["text", "long_text", "yes_no", "date"]),
  required: z.boolean(),
  help: z.string().optional(),
});

export const historyConfigSchema = z.object({
  heading: z.string().min(1).default("History"),
  intro: z.string().default(""),
  questions: z.array(historyQuestionSchema).min(1),
});

export const consentConfigSchema = z.object({
  heading: z.string().min(1),
  body: z.string().min(20, "A consent block needs real consent text"),
  /** Require the patient to scroll the text before the continue button enables. */
  requireScroll: z.boolean().default(true),
});

export const signatureConfigSchema = z.object({
  heading: z.string().min(1).default("Signature"),
  /** The ESIGN/UETA consent-to-sign sentence. Stored with every signature. */
  disclosure: z.string().min(20),
  allowDrawn: z.boolean().default(true),
  /** Which consent block this signature attests to. Must precede it. */
  consentBlockKey: z.string().min(1),
});

export const uploadConfigSchema = z.object({
  heading: z.string().min(1).default("Upload"),
  label: z.string().min(1),
  help: z.string().default(""),
  accept: z.array(z.string().min(1)).min(1),
  maxBytes: z.number().int().positive().max(20 * 1024 * 1024),
  required: z.boolean().default(false),
});

export const screenerConfigSchema = z.object({
  instrument: z.enum(["phq9", "gad7"]),
});

export const CONFIG_SCHEMAS = {
  demographics: demographicsConfigSchema,
  insurance: insuranceConfigSchema,
  history: historyConfigSchema,
  consent: consentConfigSchema,
  signature: signatureConfigSchema,
  upload: uploadConfigSchema,
  screener: screenerConfigSchema,
} as const;

export type DemographicsConfig = z.infer<typeof demographicsConfigSchema>;
export type InsuranceConfig = z.infer<typeof insuranceConfigSchema>;
export type HistoryConfig = z.infer<typeof historyConfigSchema>;
export type ConsentConfig = z.infer<typeof consentConfigSchema>;
export type SignatureConfig = z.infer<typeof signatureConfigSchema>;
export type UploadConfig = z.infer<typeof uploadConfigSchema>;
export type ScreenerConfig = z.infer<typeof screenerConfigSchema>;

/** Parse a block's config, throwing a readable error naming the block. */
export function parseConfig<K extends BlockKind>(
  kind: K,
  config: unknown,
): z.infer<(typeof CONFIG_SCHEMAS)[K]> {
  return CONFIG_SCHEMAS[kind].parse(config) as z.infer<(typeof CONFIG_SCHEMAS)[K]>;
}

/** Non-throwing variant for rendering a possibly hand-edited block. */
export function safeConfig<K extends BlockKind>(
  kind: K,
  config: unknown,
): z.infer<(typeof CONFIG_SCHEMAS)[K]> | null {
  const parsed = CONFIG_SCHEMAS[kind].safeParse(config);
  return parsed.success ? (parsed.data as z.infer<(typeof CONFIG_SCHEMAS)[K]>) : null;
}

/* -------------------------------------------------------------- definitions */

export interface BlockDefinition {
  kind: BlockKind;
  label: string;
  description: string;
  /** Mono config summary shown on the builder card. */
  summary: (block: FormBlock) => string;
}

export function blockHeading(block: FormBlock): string {
  const heading = block.config?.heading;
  if (typeof heading === "string" && heading.trim()) return heading;
  const def = screenerDef(block);
  if (def) return def.name;
  return BLOCK_LABEL[block.kind];
}

const BLOCK_LABEL: Record<BlockKind, string> = {
  demographics: "Demographics",
  insurance: "Insurance",
  history: "History",
  consent: "Consent",
  signature: "Signature",
  upload: "File upload",
  screener: "Screener",
};

function screenerDef(block: FormBlock) {
  if (block.kind !== "screener") return null;
  const cfg = safeConfig("screener", block.config);
  return cfg ? screenerDefinition(cfg.instrument) : null;
}

export function blockRegistry(): BlockDefinition[] {
  return [
    {
      kind: "demographics",
      label: "Demographics",
      description: "Name, date of birth, contact details, emergency contact.",
      summary: (b) => {
        const cfg = safeConfig("demographics", b.config);
        return cfg ? `${cfg.fields.length} fields · maps to export columns` : "invalid config";
      },
    },
    {
      kind: "insurance",
      label: "Insurance",
      description: "Carrier, member ID, subscriber — or a self-pay answer.",
      summary: (b) => {
        const cfg = safeConfig("insurance", b.config);
        return cfg ? `${cfg.fields.length} fields` : "invalid config";
      },
    },
    {
      kind: "history",
      label: "History",
      description: "Your own questions: presenting concern, medications, prior care.",
      summary: (b) => {
        const cfg = safeConfig("history", b.config);
        return cfg ? `${cfg.questions.length} questions` : "invalid config";
      },
    },
    {
      kind: "screener",
      label: "Screener",
      description: "PHQ-9 or GAD-7, scored automatically on both sides.",
      summary: (b) => {
        const def = screenerDef(b);
        return def ? `${def.items.length} items · auto-scored · max ${def.maxTotal}` : "invalid config";
      },
    },
    {
      kind: "consent",
      label: "Consent text",
      description: "The exact text a patient agrees to. Snapshotted at publish.",
      summary: (b) => {
        const cfg = safeConfig("consent", b.config);
        return cfg ? `${cfg.body.trim().split(/\s+/).length} words · scroll required` : "invalid config";
      },
    },
    {
      kind: "signature",
      label: "Signature",
      description: "Typed or drawn, with the consent-to-sign disclosure and hash.",
      summary: (b) => {
        const cfg = safeConfig("signature", b.config);
        return cfg ? `${cfg.allowDrawn ? "typed or drawn" : "typed only"} · hashed` : "invalid config";
      },
    },
    {
      kind: "upload",
      label: "File upload",
      description: "Insurance card, prior records. Encrypted before storage.",
      summary: (b) => {
        const cfg = safeConfig("upload", b.config);
        return cfg ? `${cfg.accept.join(", ")} · max ${Math.round(cfg.maxBytes / 1024 / 1024)}MB` : "invalid config";
      },
    },
  ];
}

/* ------------------------------------------------------------------ fields */

const YES_NO_HELP = "Yes or no";

/** Flatten one block into the fields a patient actually answers. */
export function blockFields(block: FormBlock): Field[] {
  switch (block.kind) {
    case "demographics": {
      const cfg = safeConfig("demographics", block.config);
      if (!cfg) return [];
      return cfg.fields.flatMap((sel) => {
        const cat = demographicsFieldCatalog.find((f) => f.key === sel.key);
        if (!cat) return [];
        return [
          {
            name: `${block.key}.${cat.key}`,
            label: cat.label,
            kind: cat.kind,
            required: sel.required,
          },
        ];
      });
    }
    case "insurance": {
      const cfg = safeConfig("insurance", block.config);
      if (!cfg) return [];
      return cfg.fields.flatMap((sel) => {
        const cat = insuranceFieldCatalog.find((f) => f.key === sel.key);
        if (!cat) return [];
        return [
          {
            name: `${block.key}.${cat.key}`,
            label: cat.label,
            kind: cat.kind,
            required: sel.required,
            help: cat.kind === "yes_no" ? YES_NO_HELP : undefined,
          },
        ];
      });
    }
    case "history": {
      const cfg = safeConfig("history", block.config);
      if (!cfg) return [];
      return cfg.questions.map((q) => ({
        name: `${block.key}.${q.key}`,
        label: q.label,
        kind: q.kind as FieldKind,
        required: q.required,
        help: q.help,
      }));
    }
    case "screener": {
      const def = screenerDef(block);
      if (!def) return [];
      return def.items.map((item, i) => ({
        name: `${block.key}.i${i + 1}`,
        label: item,
        kind: "scale4",
        required: true,
        options: def.options.map((o) => ({ value: String(o.value), label: o.label })),
      }));
    }
    case "upload": {
      const cfg = safeConfig("upload", block.config);
      if (!cfg) return [];
      return [
        {
          name: `${block.key}.file`,
          label: cfg.label,
          kind: "file",
          required: cfg.required,
          help: cfg.help || undefined,
        },
      ];
    }
    case "signature": {
      const cfg = safeConfig("signature", block.config);
      if (!cfg) return [];
      return [
        {
          name: `${block.key}.signature`,
          label: "Your signature",
          kind: "signature",
          required: true,
          help: cfg.disclosure,
        },
      ];
    }
    case "consent":
      // A consent block asks nothing; its signature block does.
      return [];
    default:
      return [];
  }
}

/** The stable CSV columns a block owns. The EHR-lite contract. */
export function csvColumns(block: FormBlock): string[] {
  if (block.kind === "signature") return [`${block.key}.signed_at`, `${block.key}.document_hash`];
  if (block.kind === "screener") {
    const def = screenerDef(block);
    if (!def) return [];
    // Item answers stay out of the CSV: the export is a records artifact, and
    // the total plus severity is what a chart needs. Item detail lives in the PDF.
    return [`${block.key}.total`, `${block.key}.severity`, `${block.key}.flagged`];
  }
  return blockFields(block).map((f) => f.name);
}

export function formCsvColumns(blocks: FormBlock[]): string[] {
  return blocks.flatMap(csvColumns);
}

/* -------------------------------------------------------------- validation */

/** Structural rules on a whole form. Returns human-readable problems. */
export function validateForm(blocks: FormBlock[]): string[] {
  const problems: string[] = [];
  if (!blocks.length) return ["Add at least one block before publishing."];

  const seen = new Set<string>();
  for (const b of blocks) {
    if (!/^[a-z0-9_]+$/.test(b.key)) {
      problems.push(`Block key "${b.key}" must be lowercase letters, digits and underscores.`);
    }
    if (seen.has(b.key)) problems.push(`Two blocks share the key "${b.key}".`);
    seen.add(b.key);
    const parsed = CONFIG_SCHEMAS[b.kind].safeParse(b.config);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      problems.push(`${BLOCK_LABEL[b.kind]} block "${b.key}": ${first.message}`);
    }
  }

  if (blocks.filter((b) => b.kind === "demographics").length > 1) {
    problems.push("A packet can only have one demographics block.");
  }

  // A signature must attest to a consent block that the patient has already read.
  blocks.forEach((b, index) => {
    if (b.kind !== "signature") return;
    const cfg = safeConfig("signature", b.config);
    if (!cfg) return;
    const consentIndex = blocks.findIndex(
      (other) => other.kind === "consent" && other.key === cfg.consentBlockKey,
    );
    if (consentIndex === -1) {
      problems.push(
        `Signature block "${b.key}" points at consent block "${cfg.consentBlockKey}", which is not in this packet.`,
      );
    } else if (consentIndex > index) {
      problems.push(
        `Signature block "${b.key}" comes before the consent text it signs — move the consent block above it.`,
      );
    }
  });

  const consents = blocks.filter((b) => b.kind === "consent");
  const signatures = blocks.filter((b) => b.kind === "signature");
  for (const consent of consents) {
    const signed = signatures.some(
      (s) => safeConfig("signature", s.config)?.consentBlockKey === consent.key,
    );
    if (!signed) {
      problems.push(
        `Consent block "${consent.key}" has no signature block, so nothing records agreement to it.`,
      );
    }
  }

  return problems;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_RE = /^[0-9+()\-.\s]{7,20}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate the answers for one block. Server-side and authoritative — the
 * patient's browser is a convenience, not the gate.
 */
export function validateBlockAnswers(block: FormBlock, answers: AnswerMap): string[] {
  const problems: string[] = [];
  for (const field of blockFields(block)) {
    // Signature and file fields are validated by their own capture paths.
    if (field.kind === "signature" || field.kind === "file") continue;
    const raw = (answers[field.name] ?? "").trim();
    if (!raw) {
      if (field.required) problems.push(`"${field.label}" is required.`);
      continue;
    }
    switch (field.kind) {
      case "email":
        if (!EMAIL_RE.test(raw)) problems.push(`"${field.label}" needs a valid email address.`);
        break;
      case "phone":
        if (!PHONE_RE.test(raw)) problems.push(`"${field.label}" needs a valid phone number.`);
        break;
      case "date":
        if (!DATE_RE.test(raw)) problems.push(`"${field.label}" needs a date as YYYY-MM-DD.`);
        break;
      case "yes_no":
        if (!["yes", "no"].includes(raw.toLowerCase())) {
          problems.push(`"${field.label}" is a yes/no question.`);
        }
        break;
      case "scale4": {
        const n = Number.parseInt(raw, 10);
        if (!Number.isInteger(n) || n < 0 || n > 3) {
          problems.push(`"${field.label}" needs one of the four answers.`);
        }
        break;
      }
      default:
        break;
    }
  }
  return problems;
}

/** Screener answers for a block, in item order, for `scoreScreener`. */
export function screenerAnswers(block: FormBlock, answers: AnswerMap): string[] {
  const def = screenerDef(block);
  if (!def) return [];
  return def.items.map((_, i) => answers[`${block.key}.i${i + 1}`] ?? "");
}

export function screenerInstrument(block: FormBlock): Instrument | null {
  const cfg = block.kind === "screener" ? safeConfig("screener", block.config) : null;
  return cfg?.instrument ?? null;
}

/* -------------------------------------------------------- consent rendering */

/**
 * The canonical text of a consent block — what gets copied onto the signature
 * record and hashed. Deliberately plain: line endings normalised, trailing
 * whitespace stripped, so the same consent always produces the same hash.
 */
export function renderConsentText(block: FormBlock): string {
  const cfg = safeConfig("consent", block.config);
  if (!cfg) return "";
  const body = cfg.body.replace(/\r\n/g, "\n").trim();
  return `${cfg.heading.trim()}\n\n${body}`;
}

/** Paragraphs, for rendering the consent block on a phone. */
export function consentParagraphs(block: FormBlock): string[] {
  const cfg = safeConfig("consent", block.config);
  if (!cfg) return [];
  return cfg.body
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * Canonical rendering of a whole published version. Hashed into
 * `form_versions.blocks_hash` so a version's integrity can be checked later.
 */
export function renderVersionText(title: string, version: number, blocks: FormBlock[]): string {
  const lines = [`FORM: ${title}`, `VERSION: ${version}`, ""];
  for (const b of blocks) {
    lines.push(`BLOCK ${b.key} (${b.kind})`);
    if (b.kind === "consent") {
      lines.push(renderConsentText(b));
    } else if (b.kind === "signature") {
      const cfg = safeConfig("signature", b.config);
      if (cfg) lines.push(`DISCLOSURE: ${cfg.disclosure.trim()}`, `SIGNS: ${cfg.consentBlockKey}`);
    } else {
      for (const f of blockFields(b)) {
        lines.push(`- ${f.name}: ${f.label}${f.required ? " *" : ""}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

/* ---------------------------------------------------------------- sections */

/**
 * One block per screen, except a consent block and the signature block that
 * signs it, which travel together — a patient must never sign on a screen that
 * does not show the text.
 */
export interface Section {
  index: number;
  blocks: FormBlock[];
  title: string;
}

export function sections(blocks: FormBlock[]): Section[] {
  const out: Section[] = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    const next = blocks[i + 1];
    if (
      block.kind === "consent" &&
      next?.kind === "signature" &&
      safeConfig("signature", next.config)?.consentBlockKey === block.key
    ) {
      out.push({ index: out.length, blocks: [block, next], title: blockHeading(block) });
      i += 2;
      continue;
    }
    out.push({ index: out.length, blocks: [block], title: blockHeading(block) });
    i += 1;
  }
  return out;
}
