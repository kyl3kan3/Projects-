/**
 * src/lib/honesty.ts
 *
 * The provenance notices. One module, imported by every surface that renders a
 * transcript, a note, or an export, so the answer to "where did this text come
 * from?" is never left to the reader's assumption.
 *
 * There are exactly two things a clinician must never be allowed to mistake:
 *
 *  1. A **fixture transcript** for a transcript of their session. When no ASR
 *     provider is configured, the pipeline still runs — with built-in demo
 *     dialogue. That is useful for evaluating the product and indefensible if it
 *     is not labelled.
 *  2. A **fixture draft** for a clinical draft. The built-in drafter is
 *     extractive: it quotes the transcript rather than composing from it. Said
 *     plainly, that is a feature; left unsaid, it is a lie about authorship.
 *
 * Pure strings and predicates — safe to import from a client component, and
 * `src/lib/honesty.test.ts` scans the source tree to prove every rendering
 * surface uses them.
 */

/** Providers whose output is demo content rather than this session's audio. */
export function isFixtureTranscript(provider: string | null | undefined): boolean {
  return provider === "fixture";
}

/** Models whose output is the built-in extractive drafter, not an LLM. */
export function isFixtureDraft(model: string | null | undefined): boolean {
  return Boolean(model && model.startsWith("fixture"));
}

export const FIXTURE_TRANSCRIPT_NOTICE =
  "Demo transcript — no transcription provider is configured, so this is built-in fictional dialogue, not this session's audio.";

export const FIXTURE_DRAFT_NOTICE =
  "Drafted by the built-in extractive drafter — no language model is configured, so every sentence is quoted from the transcript rather than composed. Review it as a starting point, not as a clinical narrative.";

export const PURGED_MEDIA_NOTICE = (retentionDays: number) =>
  `Source audio and transcript were purged per your ${retentionDays}-day retention policy. The signed note is the durable record.`;

export interface ProvenanceInput {
  transcriptProvider?: string | null;
  noteModel?: string | null;
}

/** Every notice that applies, in reading order. Empty when nothing is a fixture. */
export function provenanceNotices(input: ProvenanceInput): string[] {
  const notices: string[] = [];
  if (isFixtureTranscript(input.transcriptProvider)) {
    notices.push(FIXTURE_TRANSCRIPT_NOTICE);
  }
  if (isFixtureDraft(input.noteModel)) notices.push(FIXTURE_DRAFT_NOTICE);
  return notices;
}

/** One-line form for the PDF footer and the plain-text export. */
export function provenanceLine(input: ProvenanceInput): string | null {
  const notices = provenanceNotices(input);
  return notices.length ? notices.join(" ") : null;
}
