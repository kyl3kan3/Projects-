/**
 * The versioned team rulebook: `.mergemate.yml`.
 *
 * Parse, validate, and resolve to the settings the review pipeline runs on.
 * Two properties matter more than the schema itself:
 *
 *  1. **An invalid rulebook never silently disables review.** `parseRulebook`
 *     always returns something usable: either the team's config, or the defaults
 *     plus the list of errors. The caller keeps the previous good version active
 *     and reports the errors on a check run (ARCHITECTURE.md flow 3).
 *  2. **A rulebook can tighten the confidence gate but not loosen it below the
 *     product floor.** The whole promise is that the bot is quiet; a config that
 *     could set `threshold: 0.1` would let a repo turn MergeMate into the noisy
 *     tool it exists to replace. `THRESHOLD_FLOOR` is enforced here, in the
 *     resolver, not in the UI.
 */

import { parse as parseYaml } from "yaml";
import { z } from "zod";

/** No rulebook may post findings below this confidence, whatever it says. */
export const THRESHOLD_FLOOR = 0.6;
export const DEFAULT_THRESHOLD = 0.8;
export const DEFAULT_MAX_COMMENTS = 6;
/** Ceiling on the per-PR comment cap: "low noise" is not negotiable either. */
export const MAX_COMMENTS_CEILING = 10;

const categoryEnum = z.enum(["bug", "security", "standards"]);
const severityEnum = z.enum(["low", "medium", "high", "critical"]);
const summaryModeEnum = z.enum(["always", "on_findings", "never"]);

const ruleSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9][a-z0-9-]*$/, "rule id must be lower-case kebab-case"),
    category: categoryEnum.default("standards"),
    /** The natural-language instruction handed to the model. */
    description: z.string().min(8).max(500),
    /** Optional regex pre-filter; a rule with one only fires on matching files. */
    pattern: z.string().max(300).optional(),
    severity: severityEnum.default("medium"),
    /** Per-rule floor, for a rule the team wants held to a higher bar. */
    confidence_floor: z.number().min(0).max(1).optional(),
    paths: z.array(z.string().min(1)).max(50).default([]),
    enabled: z.boolean().default(true),
  })
  .strict();

const rulebookSchema = z
  .object({
    version: z.literal(1).default(1),
    categories: z
      .object({
        bug: z.boolean().default(true),
        security: z.boolean().default(true),
        standards: z.boolean().default(true),
      })
      .strict()
      .default({}),
    confidence: z
      .object({
        threshold: z.number().min(0).max(1).default(DEFAULT_THRESHOLD),
        max_comments_per_pr: z.number().int().min(0).max(50).default(DEFAULT_MAX_COMMENTS),
      })
      .strict()
      .default({}),
    summary: summaryModeEnum.default("on_findings"),
    /** Post suggestion blocks when a mechanical fix exists. */
    suggested_patches: z.boolean().default(true),
    paths: z
      .object({
        include: z.array(z.string().min(1)).max(100).default([]),
        exclude: z.array(z.string().min(1)).max(100).default([]),
      })
      .strict()
      .default({}),
    rules: z.array(ruleSchema).max(200).default([]),
  })
  .strict();

export type RulebookConfig = z.infer<typeof rulebookSchema>;
export type RuleConfig = z.infer<typeof ruleSchema>;
export type SummaryMode = z.infer<typeof summaryModeEnum>;

export const DEFAULT_RULEBOOK: RulebookConfig = rulebookSchema.parse({});

export interface ParseResult {
  /** Always usable: the parsed config, or the defaults when parsing failed. */
  config: RulebookConfig;
  valid: boolean;
  errors: string[];
}

/**
 * Parse and validate a `.mergemate.yml` body.
 *
 * Never throws. A YAML syntax error, a non-object document, an unknown key or a
 * duplicate rule id all come back as `valid: false` with human-readable errors
 * suitable for a failing check run.
 */
export function parseRulebook(raw: string): ParseResult {
  if (raw.trim() === "") {
    return { config: DEFAULT_RULEBOOK, valid: false, errors: ["rulebook is empty"] };
  }

  let doc: unknown;
  try {
    doc = parseYaml(raw, { strict: true });
  } catch (err) {
    const message = err instanceof Error ? err.message.split("\n")[0] : String(err);
    return { config: DEFAULT_RULEBOOK, valid: false, errors: [`YAML syntax error: ${message}`] };
  }

  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    return {
      config: DEFAULT_RULEBOOK,
      valid: false,
      errors: ["rulebook must be a YAML mapping at the top level"],
    };
  }

  const parsed = rulebookSchema.safeParse(doc);
  if (!parsed.success) {
    return {
      config: DEFAULT_RULEBOOK,
      valid: false,
      errors: parsed.error.issues.map(formatIssue),
    };
  }

  const errors: string[] = [];
  const seen = new Set<string>();
  for (const rule of parsed.data.rules) {
    if (seen.has(rule.id)) errors.push(`duplicate rule id: ${rule.id}`);
    seen.add(rule.id);
    if (rule.pattern !== undefined) {
      try {
        new RegExp(rule.pattern);
      } catch {
        errors.push(`rule ${rule.id}: pattern is not a valid regular expression`);
      }
    }
  }

  if (errors.length > 0) return { config: DEFAULT_RULEBOOK, valid: false, errors };
  return { config: parsed.data, valid: true, errors: [] };
}

function formatIssue(issue: z.ZodIssue): string {
  const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
  if (issue.code === "unrecognized_keys") {
    return `${path}: unknown key${issue.keys.length > 1 ? "s" : ""} ${issue.keys.join(", ")}`;
  }
  return `${path}: ${issue.message}`;
}

/* --------------------------------------------------------------- resolved --- */

/**
 * The settings a single review run uses, after the rulebook, the installation
 * overrides and the product floors have all been applied.
 */
export interface ResolvedPolicy {
  /** Confidence, in basis points, a finding must reach to be posted. */
  thresholdBp: number;
  maxComments: number;
  categories: Record<"bug" | "security" | "standards", boolean>;
  summary: SummaryMode;
  suggestedPatches: boolean;
  include: string[];
  exclude: string[];
  rules: RuleConfig[];
  /** Per-rule floors, in basis points, keyed by rule id. */
  ruleFloorsBp: Record<string, number>;
  /** True when nothing may be posted to GitHub at all. */
  shadowMode: boolean;
}

export interface PolicyInputs {
  config: RulebookConfig;
  /** Installation-level threshold override (Business tier). */
  installationThreshold?: number | undefined;
  shadowMode?: boolean | undefined;
  /** Global default from env, used when the rulebook does not set one. */
  defaultThreshold?: number | undefined;
  defaultMaxComments?: number | undefined;
}

export function toBp(confidence: number): number {
  return Math.round(confidence * 10_000);
}

export function fromBp(bp: number): number {
  return bp / 10_000;
}

/**
 * Fold the rulebook, the installation overrides and the product floors into the
 * policy a review run obeys.
 *
 * Precedence: installation override (Business) > rulebook > env default. The
 * floor clamps all of them, in both directions — no config can drop the
 * threshold under THRESHOLD_FLOOR or raise the comment cap over the ceiling.
 */
export function resolvePolicy(inputs: PolicyInputs): ResolvedPolicy {
  const { config } = inputs;
  const rulebookSetThreshold = config.confidence.threshold;
  const chosen =
    inputs.installationThreshold ??
    rulebookSetThreshold ??
    inputs.defaultThreshold ??
    DEFAULT_THRESHOLD;

  const thresholdBp = Math.max(toBp(THRESHOLD_FLOOR), Math.min(10_000, toBp(chosen)));

  const requestedCap = config.confidence.max_comments_per_pr ?? inputs.defaultMaxComments ?? DEFAULT_MAX_COMMENTS;
  const maxComments = Math.max(0, Math.min(MAX_COMMENTS_CEILING, Math.trunc(requestedCap)));

  const ruleFloorsBp: Record<string, number> = {};
  for (const rule of config.rules) {
    if (rule.confidence_floor !== undefined) {
      ruleFloorsBp[rule.id] = Math.max(thresholdBp, toBp(rule.confidence_floor));
    }
  }

  return {
    thresholdBp,
    maxComments,
    categories: { ...config.categories },
    summary: config.summary,
    suggestedPatches: config.suggested_patches,
    include: [...config.paths.include],
    exclude: [...config.paths.exclude],
    rules: config.rules.filter((r) => r.enabled),
    ruleFloorsBp,
    shadowMode: inputs.shadowMode === true,
  };
}

/** The effective bar for one finding: the rule's floor if it has one. */
export function effectiveThresholdBp(policy: ResolvedPolicy, ruleId: string | null): number {
  if (ruleId && policy.ruleFloorsBp[ruleId] !== undefined) {
    return policy.ruleFloorsBp[ruleId] as number;
  }
  return policy.thresholdBp;
}
