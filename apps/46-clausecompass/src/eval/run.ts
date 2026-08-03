/**
 * src/eval/run.ts — `npm run eval`
 *
 * The quality gate for a product whose worst failure is missing an indemnity clause.
 * It runs the real pipeline stages (parse → extract → score) over the hand-labelled
 * fixtures and fails the process on a regression, so a prompt, schema, playbook or
 * model change cannot ship on vibes.
 *
 * What it measures per fixture:
 *  - **flag recall** against `expectedFlags` (gate: 90%);
 *  - **unexpected flags**, listed but not failed — a new rule legitimately adds them,
 *    and the diff is what a human should look at;
 *  - **fabricated quotes**: any stored quote that is not a substring of the parsed
 *    text. The gate is zero, and it is a hard failure;
 *  - **determinism**: five runs must produce identical flag sets;
 *  - **explanation gates**: every explanation must pass the banned-phrase and
 *    reading-level checks;
 *  - **token cost** per review, which is the COGS line in the business model.
 *
 * With `ANTHROPIC_API_KEY` set it exercises the model path. Without one it exercises the
 * deterministic analyser and says so — the numbers are still meaningful, because the
 * anchoring, scoring and gate logic are the same either way.
 */

import "@/lib/load-env";
import { eq } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import { evalCases } from "@/db/schema";
import { normalizeWhitespace, parseText } from "@/lib/parse";
import { extractClauses } from "@/lib/extract";
import { DEFAULT_RULES, score, type ScorableRule } from "@/lib/playbook";
import { explainFromTemplate, gateExplanation } from "@/lib/explain";
import { CLAUSE_LABELS } from "@/lib/taxonomy";
import { FIXTURES, type ContractFixture } from "@/fixtures/contracts";
import { claudeConfigured } from "@/lib/env";

const RECALL_GATE = 0.9;
const DETERMINISM_RUNS = 5;

interface CaseResult {
  key: string;
  firedKeys: string[];
  missing: string[];
  unexpected: string[];
  recall: number;
  fabricatedQuotes: number;
  clauseCount: number;
  coverage: { sections: number; analyzed: number; boilerplate: number; notAnalyzed: number };
  gateFailures: string[];
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
}

async function runCase(fixture: ContractFixture): Promise<CaseResult> {
  const parsed = parseText(fixture.text);
  const extraction = await extractClauses(parsed);

  const haystack = normalizeWhitespace(parsed.fullText);
  let fabricated = 0;
  for (const clause of extraction.clauses) {
    for (const span of clause.sourceSpans) {
      if (!haystack.includes(normalizeWhitespace(span.quote))) fabricated++;
    }
  }

  const fired = score({
    contractType: fixture.contractType,
    clauses: extraction.clauses.map((c, i) => ({
      id: `c${i}`,
      clauseType: c.clauseType,
      fields: c.fields,
    })),
    rules: DEFAULT_RULES as unknown as ScorableRule[],
  });

  const firedKeys = fired.map((f) => f.ruleKey).sort();
  const missing = fixture.expectedFlags.filter((k) => !firedKeys.includes(k));
  const unexpected = firedKeys.filter((k) => !fixture.expectedFlags.includes(k));
  const recall =
    fixture.expectedFlags.length === 0
      ? 1
      : (fixture.expectedFlags.length - missing.length) / fixture.expectedFlags.length;

  // Every flag's explanation must pass the gates, in whichever form it will ship.
  const gateFailures: string[] = [];
  for (const f of fired) {
    const rule = DEFAULT_RULES.find((r) => r.ruleKey === f.ruleKey);
    if (!rule) continue;
    const clause = extraction.clauses.find((c) => c.clauseType === f.clauseType);
    const explanation = explainFromTemplate({
      clauseLabel: CLAUSE_LABELS[f.clauseType],
      quote: clause?.sourceSpans[0]?.quote ?? null,
      firedBecause: f.firedBecause,
      severity: f.severity,
      rule,
      vars: { value: f.value ?? "—", threshold: rule.threshold ?? "—", months: clause?.fields.months ?? "—" },
    });
    const gate = gateExplanation([
      explanation.whatItSays,
      explanation.forYou,
      explanation.market,
      explanation.redline.rationale,
    ]);
    if (!gate.ok) gateFailures.push(`${f.ruleKey}: ${gate.reasons.join("; ")}`);
  }

  return {
    key: fixture.key,
    firedKeys,
    missing,
    unexpected,
    recall,
    fabricatedQuotes: fabricated,
    clauseCount: extraction.clauses.length,
    coverage: {
      sections: extraction.coverage.length,
      analyzed: extraction.coverage.filter((c) => c.disposition === "clause").length,
      boilerplate: extraction.coverage.filter((c) => c.disposition === "boilerplate").length,
      notAnalyzed: extraction.coverage.filter((c) => c.disposition === "not_analyzed").length,
    },
    gateFailures,
    inputTokens: extraction.usage.inputTokens,
    outputTokens: extraction.usage.outputTokens,
    costMicros: extraction.costMicros,
  };
}

async function determinismCheck(fixture: ContractFixture): Promise<boolean> {
  const signatures = new Set<string>();
  for (let i = 0; i < DETERMINISM_RUNS; i++) {
    const result = await runCase(fixture);
    signatures.add(result.firedKeys.join(","));
  }
  return signatures.size === 1;
}

async function persist(result: CaseResult, fixture: ContractFixture): Promise<void> {
  const db = getDb();
  const payload = {
    fixtureKey: fixture.key,
    name: fixture.name,
    contractType: fixture.contractType,
    expectedFlags: fixture.expectedFlags,
    lastRunAt: new Date(),
    lastResult: result as unknown as Record<string, unknown>,
  };
  await db
    .insert(evalCases)
    .values(payload)
    .onConflictDoUpdate({
      target: evalCases.fixtureKey,
      set: {
        name: payload.name,
        expectedFlags: payload.expectedFlags,
        lastRunAt: payload.lastRunAt,
        lastResult: payload.lastResult,
      },
    });
}

async function previousResult(key: string): Promise<CaseResult | null> {
  const db = getDb();
  const [row] = await db.select().from(evalCases).where(eq(evalCases.fixtureKey, key));
  return (row?.lastResult as unknown as CaseResult) ?? null;
}

export async function runEvals(): Promise<number> {
  const mode = claudeConfigured() ? "claude" : "local deterministic analyser";
  console.log(`ClauseCompass eval — extraction via ${mode}\n`);

  let failures = 0;
  let totalCost = 0;

  for (const fixture of FIXTURES) {
    const before = await previousResult(fixture.key).catch(() => null);
    const result = await runCase(fixture);
    totalCost += result.costMicros;

    const recallPct = Math.round(result.recall * 100);
    console.log(`${fixture.key} — ${fixture.name}`);
    console.log(
      `  clauses ${result.clauseCount} · coverage ${result.coverage.analyzed}/${result.coverage.sections} analyzed, ${result.coverage.notAnalyzed} not analyzed`,
    );
    console.log(`  flag recall ${recallPct}% (${fixture.expectedFlags.length - result.missing.length}/${fixture.expectedFlags.length})`);
    if (result.missing.length) console.log(`  MISSING: ${result.missing.join(", ")}`);
    if (result.unexpected.length) console.log(`  extra:   ${result.unexpected.join(", ")}`);
    console.log(`  fabricated quotes: ${result.fabricatedQuotes}`);
    if (result.gateFailures.length) console.log(`  GATE FAILURES: ${result.gateFailures.join(" | ")}`);
    if (before) {
      const gained = result.firedKeys.filter((k) => !before.firedKeys.includes(k));
      const lost = before.firedKeys.filter((k) => !result.firedKeys.includes(k));
      if (gained.length || lost.length) {
        console.log(`  diff vs last run — gained: ${gained.join(", ") || "none"}; lost: ${lost.join(", ") || "none"}`);
      } else {
        console.log("  diff vs last run — identical");
      }
    }

    const deterministic = await determinismCheck(fixture);
    console.log(`  determinism over ${DETERMINISM_RUNS} runs: ${deterministic ? "identical" : "DIVERGED"}`);
    if (result.costMicros > 0) {
      console.log(
        `  tokens ${result.inputTokens} in / ${result.outputTokens} out · $${(result.costMicros / 1_000_000).toFixed(4)}`,
      );
    }
    console.log("");

    if (result.recall < RECALL_GATE) failures++;
    if (result.fabricatedQuotes > 0) failures++;
    if (result.gateFailures.length > 0) failures++;
    if (!deterministic) failures++;

    await persist(result, fixture);
  }

  if (totalCost > 0) {
    console.log(`total token cost for this run: $${(totalCost / 1_000_000).toFixed(4)}`);
  }
  console.log(failures === 0 ? "eval: PASS" : `eval: FAIL (${failures} gate failures)`);
  return failures;
}

const isDirectRun = process.argv[1]?.includes("eval/run");
if (isDirectRun) {
  runEvals()
    .then(async (failures) => {
      await closeDb();
      process.exit(failures === 0 ? 0 : 1);
    })
    .catch(async (err) => {
      console.error(err);
      await closeDb();
      process.exit(1);
    });
}
