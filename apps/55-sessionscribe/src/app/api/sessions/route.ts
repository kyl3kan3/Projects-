/**
 * src/app/api/sessions/route.ts
 *
 * Session capture endpoint: creates the session row and (for audio paths)
 * returns a signed R2 PUT URL. The pipeline starts here.
 *
 * TODO:
 * - [ ] POST: requirePractice(); zod-validate {clientId, heldAt,
 *       captureKind, shorthandText?}.
 * - [ ] Consent gate: captureKind=recording requires the client's
 *       recording_consent != none — reject with the consent-script hint;
 *       shorthand is never gated.
 * - [ ] Audio paths: create audio_artifacts row with purge_at stamped from
 *       the practice retention window; return signed PUT URL.
 * - [ ] PUT-complete callback (or finalize field): enqueue
 *       transcribe-session. Shorthand: enqueue draft-note directly.
 * - [ ] Solo-tier meter: 41st note this period -> 402 with upgrade hint
 *       (existing drafts always remain reviewable).
 * - [ ] Audit event per capture.
 */

export async function POST(_req: Request): Promise<Response> {
  // TODO: implement per ARCHITECTURE.md key flow 1
  return new Response("Not implemented", { status: 501 });
}
