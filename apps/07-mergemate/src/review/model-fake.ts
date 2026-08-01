/**
 * The deterministic model.
 *
 * Used by every unit test, by the golden-set harness, and automatically whenever
 * ANTHROPIC_API_KEY is absent. It is a real (if shallow) reviewer: a fixed set of
 * detectors over the added lines of a diff, each with a fixed confidence. That
 * makes the whole pipeline — anchoring, gating, suppression, posting, cost
 * telemetry — testable end to end with no network, and it makes the golden-set
 * numbers reproducible.
 *
 * The confidences are chosen to span the gate on purpose: `no-console-log` at
 * 0.55 and `missing-await` at 0.72 sit below the 0.8 default, so a corpus run
 * exercises silence as well as speech.
 *
 * Its findings go out under model id "fake-deterministic", which the dashboard
 * and the summary comment both surface. A review produced by this class is never
 * presented as a review produced by Claude.
 */

import type { DiffFile, DiffLine } from "../diff/parse";
import type { ResolvedPolicy } from "../rules/rulebook";
import { pathAllowed } from "../rules/glob";
import type { AnalysisRequest, ReviewModel, ScoringRequest } from "./model";
import { buildAnalysisPrompt, buildScoringPrompt } from "./prompt";
import { estimateTokens } from "./cost";
import { sanitisePatch, sanitiseText, MAX_BODY_LEN, MAX_TITLE_LEN } from "./parse-output";
import type { AnalysisOutcome, RawFinding, ScoreEntry, ScoringOutcome } from "./types";
import type { FindingCategory } from "../db/schema";

export const FAKE_MODEL_ID = "fake-deterministic";

interface Detector {
  /** Rulebook rule id this detector claims, when the rulebook defines it. */
  ruleId: string | null;
  category: FindingCategory;
  confidence: number;
  test: RegExp;
  /** Extra guard, for detectors a regex alone gets wrong too often. */
  guard?: (line: DiffLine, file: DiffFile) => boolean;
  title: string;
  body: (line: DiffLine) => string;
  patch?: (line: DiffLine) => string | null;
  /** Restrict to files matching these globs. */
  paths?: string[];
}

/**
 * Assignment of a quoted literal to an identifier whose name suggests a secret.
 * Capture group 1 is the literal's contents.
 */
const CREDENTIAL_ASSIGNMENT =
  /[A-Za-z_$][\w$.]*(?:key|secret|password|passwd|token|credential)[\w$]*\s*[:=]\s*["']([^"'\s]{12,})["']/i;

/** Known credential prefixes, in the format their issuers actually use. */
const SECRET_PREFIXES =
  /^(?:sk|pk|rk|sk_live|sk_test|ghp|gho|ghs|ghu|github_pat|glpat|xox[baprs]|AKIA|ASIA|AIza|npm_|hs256|dop_v1|shpat|SG\.)[-_A-Za-z0-9.]{10,}$/;

/**
 * Does this literal look like a secret, as opposed to a name that merely lives in a
 * variable called `*_KEY`?
 *
 * Found the hard way: the first real-repository dry run flagged
 * `const CACHE_KEY = "entitlement.plus"` as a committed credential. A cache key, a
 * translation key and a storage key all sit in identifiers that match, so the value
 * has to carry the evidence: either a recognised issuer prefix, or a long
 * high-entropy run with no word-like structure.
 */
export function looksLikeSecret(value: string): boolean {
  if (SECRET_PREFIXES.test(value)) return true;
  // Dotted or spaced values are names ("entitlement.plus", "user password").
  if (/[\s]/.test(value)) return false;
  if (/\./.test(value) && !/^[A-Fa-f0-9]{24,}$/.test(value)) return false;
  if (value.length < 20) return false;
  if (!/^[A-Za-z0-9+/=_-]+$/.test(value)) return false;
  const digits = (value.match(/\d/g) ?? []).length;
  const upper = /[A-Z]/.test(value);
  const lower = /[a-z]/.test(value);
  // A long run with digits and mixed case is a key; "unlimited-medications-plus" is not.
  return digits >= 2 && (upper === lower ? true : digits >= 3 || (upper && lower));
}

const DETECTORS: Detector[] = [
  {
    ruleId: "no-raw-sql",
    category: "security",
    confidence: 0.94,
    test: /(?:sql`|\.query\(|execute\()[^`)]*\$\{/,
    title: "Interpolated value inside a SQL string",
    body: (line) =>
      `This builds SQL by interpolation:\n\n\`\`\`\n${line.content.trim()}\n\`\`\`\n\nAny value reaching that \`\${…}\` is concatenated into the statement, so a caller controls the query text. Pass it as a bound parameter instead.`,
  },
  {
    ruleId: null,
    category: "security",
    confidence: 0.97,
    // An identifier that *contains* key/secret/password/token, assigned a quoted
    // literal that actually looks like a credential — see `looksLikeSecret`, which
    // exists because "const CACHE_KEY = 'entitlement.plus'" is not one.
    test: CREDENTIAL_ASSIGNMENT,
    guard: (line) => {
      if (/process\.env|os\.environ|getenv|import\.meta\.env/i.test(line.content)) return false;
      const m = CREDENTIAL_ASSIGNMENT.exec(line.content);
      return m ? looksLikeSecret(m[1] ?? "") : false;
    },
    title: "Credential committed in source",
    body: (line) =>
      `Line \`${line.newLine}\` assigns a literal credential. Move it to an environment variable and rotate the value that was committed — it is in the repository history from this point on.`,
  },
  {
    ruleId: null,
    category: "security",
    confidence: 0.9,
    test: /ignore (?:all )?(?:your |the )?(?:previous|prior|above) instructions|disregard (?:your|the) (?:rules|instructions)|you are now|approve this pull request/i,
    title: "Text in the diff attempts to instruct an automated reviewer",
    /**
     * Deliberately does not quote the line. Echoing the payload would put the
     * attacker's instruction into a comment that other automation reads, which is
     * the same failure one step removed.
     */
    body: (line) =>
      `Line \`${line.newLine}\` is addressed to a code-review bot rather than to a human reader: it instructs the reviewer to change its behaviour. MergeMate treats diff content as data and did not act on it, and the text is not repeated here. Worth checking why the change contains it.`,
  },
  {
    ruleId: null,
    category: "bug",
    confidence: 0.88,
    test: /\b(?:parseFloat|Number)\s*\(\s*[\w$.[\]'"]*?(?:amount|price|total|cents|balance)/i,
    title: "Money parsed as a floating-point number",
    body: () =>
      "Amounts held as floats accumulate representation error the moment they are summed. Keep money in integer minor units and format once at the edge.",
  },
  {
    ruleId: null,
    category: "bug",
    confidence: 0.72,
    test: /^\s*(?:[A-Za-z_$][\w$.]*)\.(?:save|update|insert|delete|fetch|send|commit|flush)\s*\([^)]*\)\s*;?\s*$/,
    guard: (line) => !/\bawait\b|\.then\(|\.catch\(|return /.test(line.content),
    title: "Async call used as a statement, so its failure is discarded",
    body: (line) =>
      `\`${line.content.trim()}\` returns a promise that nothing awaits. If it rejects the error surfaces as an unhandled rejection, after the request has already returned success.`,
  },
  {
    ruleId: "no-console-in-server",
    category: "standards",
    confidence: 0.55,
    test: /\bconsole\.(?:log|info|debug)\s*\(/,
    title: "console logging in server code",
    body: () =>
      "Server code logs through the structured logger so lines stay queryable in production.",
    patch: (line) => {
      const replaced = line.content.replace(/\bconsole\.(log|info|debug)\b/, "log.info");
      return replaced === line.content ? null : replaced;
    },
  },
  {
    ruleId: null,
    category: "bug",
    confidence: 0.86,
    test: /[^=!<>]==\s*(?:null|undefined|0|"")/,
    guard: (line) => !/===/.test(line.content),
    title: "Loose equality against a falsy literal",
    body: () =>
      "`==` coerces, so this also matches values the check does not intend to accept. Use `===`, or an explicit `x === null || x === undefined`.",
    patch: (line) => line.content.replace(/([^=!<>])==(\s)/, "$1===$2"),
    paths: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
  },
  {
    ruleId: "no-mutable-default-arg",
    category: "bug",
    confidence: 0.91,
    test: /def\s+\w+\s*\([^)]*=\s*(?:\[\]|\{\}|set\(\))/,
    title: "Mutable default argument",
    body: () =>
      "A list, dict or set default is created once and shared by every call, so mutations leak between invocations. Default to `None` and build the container inside the function.",
    paths: ["**/*.py"],
  },
  {
    ruleId: "requests-need-timeout",
    category: "bug",
    confidence: 0.83,
    test: /requests\.(?:get|post|put|patch|delete)\s*\(/,
    guard: (line) => !/timeout\s*=/.test(line.content),
    title: "Outbound HTTP call with no timeout",
    body: () =>
      "Without an explicit `timeout=`, this call can hang for as long as the remote socket stays open, and takes the worker with it.",
    paths: ["**/*.py"],
  },
];

function detect(files: DiffFile[], policy: ResolvedPolicy): RawFinding[] {
  const enabledRuleIds = new Set(policy.rules.map((r) => r.id));
  const findings: RawFinding[] = [];
  let counter = 0;

  for (const file of files) {
    if (file.status === "removed") continue;
    if (!pathAllowed(file.path, policy.include, policy.exclude)) continue;

    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (line.kind !== "add" || line.newLine === null) continue;
        for (const detector of DETECTORS) {
          if (detector.paths && !pathAllowed(file.path, detector.paths, [])) continue;
          if (policy.categories[detector.category] === false) continue;
          // A detector tied to a rulebook rule only fires when the rulebook has it.
          if (detector.ruleId !== null && !enabledRuleIds.has(detector.ruleId)) continue;
          if (!detector.test.test(line.content)) continue;
          if (detector.guard && !detector.guard(line, file)) continue;

          counter += 1;
          const patch = detector.patch ? detector.patch(line) : null;
          findings.push({
            id: `f${counter}`,
            category: detector.category,
            ruleId: detector.ruleId,
            filePath: file.path,
            startLine: line.newLine,
            endLine: line.newLine,
            title: sanitiseText(detector.title, MAX_TITLE_LEN),
            body: sanitiseText(detector.body(line), MAX_BODY_LEN),
            suggestedPatch: patch === null ? null : sanitisePatch(patch),
          });
        }
      }
    }
  }
  return findings;
}

/** Exposed for the golden-set harness, which reports per-detector precision. */
export function detectFindings(files: DiffFile[], policy: ResolvedPolicy): RawFinding[] {
  return detect(files, policy);
}

export class FakeReviewModel implements ReviewModel {
  readonly id = FAKE_MODEL_ID;
  readonly isFake = true;

  async analyse(request: AnalysisRequest): Promise<AnalysisOutcome> {
    // The prompt is still assembled, so a prompt-assembly crash is caught by the
    // fake path too rather than only in production.
    const prompt = buildAnalysisPrompt(request);
    return {
      ok: true,
      findings: detect(request.files, request.policy),
      usage: { inputTokens: estimateTokens(prompt), outputTokens: 0 },
      discarded: [],
    };
  }

  async score(request: ScoringRequest): Promise<ScoringOutcome> {
    const prompt = buildScoringPrompt(request.findings, request.files);
    const byLine = lineIndex(request.files);
    const scores: ScoreEntry[] = [];

    for (const finding of request.findings) {
      const detector = DETECTORS.find((d) => d.title === finding.title);
      const line = byLine.get(`${finding.filePath}:${finding.startLine}`);
      if (!detector || !line) {
        // Cannot locate the evidence: that alone is disqualifying.
        scores.push({ id: finding.id, confidenceBp: 1_000, reason: "cited line is not in the diff" });
        continue;
      }
      const stillMatches = detector.test.test(line.content);
      scores.push({
        id: finding.id,
        confidenceBp: Math.round((stillMatches ? detector.confidence : 0.1) * 10_000),
        reason: stillMatches ? "pattern present on the cited line" : "pattern not present on the cited line",
      });
    }

    return {
      ok: true,
      scores,
      usage: { inputTokens: estimateTokens(prompt), outputTokens: 0 },
      discarded: [],
    };
  }
}

function lineIndex(files: DiffFile[]): Map<string, DiffLine> {
  const map = new Map<string, DiffLine>();
  for (const file of files) {
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (line.newLine !== null) map.set(`${file.path}:${line.newLine}`, line);
      }
    }
  }
  return map;
}
