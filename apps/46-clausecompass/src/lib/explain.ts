/**
 * src/lib/explain.ts
 *
 * Plain-English explanations and redline suggestions (pipeline pass 3):
 * for each flag, Claude writes "what it says", "what it means for you",
 * "market", and replacement language — tightly constrained, because this
 * is where a reading tool could drift into advice.
 *
 * TODO:
 * - [ ] explain(flagId): forcedToolCall with ONLY the clause quote + the
 *       fired rule as context; output schema {what_it_says,
 *       for_you, market, redline: {suggested_text, rationale,
 *       email_snippet}}.
 * - [ ] Post-generation gates (automated, blocking): reading level <=
 *       8th grade (Flesch-Kincaid); banned-phrase scan ("you should",
 *       "we advise", "legal advice", "we recommend signing"); length caps.
 * - [ ] HIGH flags append the standing "worth a real lawyer" pointer
 *       (static copy, not generated).
 * - [ ] buildEmailDraft(contractId): assemble accepted redlines into one
 *       polite "requested changes" email (deterministic template around
 *       generated snippets).
 * - [ ] Failures fall back to rule-template explanations (playbook_rules
 *       .explanation_template) — the report ships even if pass 3 degrades.
 */

export interface Explanation {
  whatItSays: string;
  forYou: string;
  market: string;
}

export function explain(_flagId: string): Promise<Explanation> {
  throw new Error("Not implemented");
}
