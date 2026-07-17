/**
 * src/lib/drafting.ts
 *
 * LLM drafting boundary: transcript (or shorthand) -> structured note
 * sections in the client's template, with mandatory source-span citations.
 * Everything Anthropic-specific lives here so the provider is swappable.
 *
 * TODO:
 * - [ ] draftNote(): build a per-section prompt from the template's
 *       {key, label, guidance} + modality; require span citations
 *       ({startMs,endMs}) per drafted sentence; conservative temperature.
 * - [ ] Validate output with zod; sections whose sentences lack spans are
 *       flagged (sourceSpans: []) — never silently accepted, never dropped.
 * - [ ] Shorthand path: expand typed shorthand instead of transcript spans;
 *       cite nothing, flag nothing (there is no tape to trace).
 * - [ ] redraftSection(): regenerate exactly one section against the same
 *       transcript; all other sections untouched.
 * - [ ] Write notes.sections + note_versions (reason: draft), bump
 *       usage_counters, stamp draft_generated_at + model.
 * - [ ] DRY_RUN=1 returns fixture sections, never calls the API.
 */

import type { NoteSection } from "@/db/schema";

/** Draft the full note for a session. Worker-only (`draft-note` job). */
export async function draftNote(_sessionId: string): Promise<NoteSection[]> {
  // TODO: implement per ARCHITECTURE.md key flow 1
  throw new Error("Not implemented");
}

/** Regenerate a single section. Worker-only (`redraft-section` job). */
export async function redraftSection(
  _noteId: string,
  _sectionKey: string,
): Promise<NoteSection> {
  throw new Error("Not implemented");
}
