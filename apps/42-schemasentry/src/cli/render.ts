/**
 * CLI rendering — pure functions, so the output a customer pastes into a bug
 * report is unit-tested rather than hoped for.
 *
 * ANSI colour is applied only when the stream is a TTY and `NO_COLOR` is unset;
 * a CI log gets plain text. There are no emoji: verdicts are words.
 */

import type { Finding, FindingLevel, Verdict } from "@/core";

export interface RenderableFinding {
  ruleId: string;
  level: FindingLevel;
  message: string;
  jsonPointer: string;
  endpoint: string | null;
  method: string | null;
  why: string;
  impactedConsumers?: string[];
}

export interface RenderInput {
  verdict: Verdict;
  summary: { breaking: number; risky: number; compatible: number; info?: number };
  fromLabel: string;
  toLabel: string;
  findings: RenderableFinding[];
  /** Only the hosted commands have one. */
  diffUrl?: string | null;
  impactedConsumers?: string[];
  /** Present when a spec is thin enough that diffs will be near-empty. */
  specHealth?: { score: number; operations: number; warnings: string[] } | null;
}

const CODES = {
  reset: "[0m",
  dim: "[2m",
  bold: "[1m",
  red: "[31m",
  yellow: "[33m",
  green: "[32m",
} as const;

export interface Palette {
  reset: string;
  dim: string;
  bold: string;
  red: string;
  yellow: string;
  green: string;
}

const PLAIN: Palette = { reset: "", dim: "", bold: "", red: "", yellow: "", green: "" };

export function palette(useColor: boolean): Palette {
  return useColor ? { ...CODES } : PLAIN;
}

export function shouldColor(stream: { isTTY?: boolean }, envVars: Record<string, string | undefined>): boolean {
  if (envVars.NO_COLOR) return false;
  if (envVars.FORCE_COLOR) return true;
  return Boolean(stream.isTTY);
}

function levelColor(level: FindingLevel, c: Palette): string {
  if (level === "breaking") return c.red;
  if (level === "risky") return c.yellow;
  if (level === "compatible") return c.green;
  return c.dim;
}

const FOOTER_LINES = [
  "This was a local, one-shot diff. The hosted check adds the deploy history:",
  "which version each consumer integrated against, who a change breaks, and a",
  "changelog page they can read. schemasentry.dev",
];

/** The human report. Ordered breaking → risky → compatible, like the UI. */
export function renderReport(input: RenderInput, c: Palette, options: { footer?: boolean } = {}): string {
  const lines: string[] = [];
  const word = input.verdict.toUpperCase();
  const verdictColor = levelColor(input.verdict, c);

  lines.push("");
  lines.push(`${c.dim}${input.fromLabel} -> ${input.toLabel}${c.reset}`);
  lines.push(`${verdictColor}${c.bold}${word}${c.reset}`);
  lines.push(
    `${c.dim}${input.summary.breaking} breaking · ${input.summary.risky} risky · ${input.summary.compatible} compatible${
      input.summary.info ? ` · ${input.summary.info} acknowledged` : ""
    }${c.reset}`,
  );

  const shown = input.findings.filter((f) => f.level !== "compatible");
  if (shown.length > 0) lines.push("");

  for (const f of shown) {
    const where = f.endpoint ? `${f.method ?? ""} ${f.endpoint}`.trim() : "API-wide";
    lines.push(`${levelColor(f.level, c)}${f.level.toUpperCase()}${c.reset}  ${f.message}`);
    lines.push(`       ${c.dim}${where}${c.reset}`);
    lines.push(`       ${c.dim}${f.jsonPointer}${c.reset}`);
    lines.push(`       ${wrap(f.why, 68, "       ")}`);
    if (f.impactedConsumers && f.impactedConsumers.length > 0) {
      lines.push(`       ${levelColor(f.level, c)}Breaks: ${f.impactedConsumers.join(" · ")}${c.reset}`);
    }
    lines.push("");
  }

  const compatible = input.findings.filter((f) => f.level === "compatible").length;
  if (compatible > 0) {
    lines.push(`${c.dim}${compatible} compatible change${compatible === 1 ? "" : "s"} not shown (--all to list).${c.reset}`);
  }

  if (input.impactedConsumers && input.impactedConsumers.length > 0) {
    lines.push(`${c.bold}Impacted consumers:${c.reset} ${input.impactedConsumers.join(", ")}`);
  }

  if (input.specHealth && input.specHealth.score < 50) {
    lines.push("");
    lines.push(
      `${c.yellow}Spec health ${input.specHealth.score}/100 across ${input.specHealth.operations} operations.${c.reset}`,
    );
    lines.push(`${c.dim}Diffs stay near-empty until the spec describes what it returns:${c.reset}`);
    for (const warning of input.specHealth.warnings.slice(0, 3)) {
      lines.push(`${c.dim}  - ${warning}${c.reset}`);
    }
  }

  if (input.diffUrl) {
    lines.push("");
    lines.push(`${c.dim}Full diff: ${input.diffUrl}${c.reset}`);
  }

  if (options.footer) {
    lines.push("");
    for (const line of FOOTER_LINES) lines.push(`${c.dim}${line}${c.reset}`);
  }

  lines.push("");
  return lines.join("\n");
}

/** Wrap prose to a width, indenting continuation lines. */
export function wrap(text: string, width: number, indent: string): string {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let line = "";
  for (const word of words) {
    if (line.length === 0) line = word;
    else if (line.length + 1 + word.length <= width) line += ` ${word}`;
    else {
      out.push(line);
      line = word;
    }
  }
  if (line) out.push(line);
  return out.join(`\n${indent}`);
}

/** The `--json` shape. Stable: this is an interface other tools will wrap. */
export function renderJson(input: RenderInput & { engineVersion: string }): string {
  return `${JSON.stringify(
    {
      engineVersion: input.engineVersion,
      verdict: input.verdict,
      summary: input.summary,
      from: input.fromLabel,
      to: input.toLabel,
      diffUrl: input.diffUrl ?? null,
      impactedConsumers: input.impactedConsumers ?? [],
      specHealth: input.specHealth ?? null,
      findings: input.findings,
    },
    null,
    2,
  )}\n`;
}

export function toRenderable(findings: Finding[]): RenderableFinding[] {
  return findings.map((f) => ({
    ruleId: f.ruleId,
    level: f.level,
    message: f.message,
    jsonPointer: f.jsonPointer,
    endpoint: f.endpoint,
    method: f.method,
    why: f.why,
  }));
}

/**
 * Exit code. `diff` is informational and always 0; `check` and `push` fail at
 * the level the caller asked for.
 */
export function exitCodeFor(verdict: Verdict, failOn: "breaking" | "risky" | "never"): number {
  if (failOn === "never") return 0;
  if (failOn === "risky") return verdict === "compatible" ? 0 : 1;
  return verdict === "breaking" ? 1 : 0;
}
