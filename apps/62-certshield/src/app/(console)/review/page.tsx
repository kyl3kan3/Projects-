/**
 * /review — the parse review queue (DESIGN.md screen 4).
 *
 * Split view: ACORD PDF left, parsed fields right with confidence;
 * low-confidence fields underlined pending-gold; confirm advances to
 * evaluation. The human gate that keeps parsing honest.
 *
 * TODO:
 * - [ ] requireSession(); queue ordered oldest-first.
 * - [ ] Field editor with per-field confidence chips; confirm action
 *       stamps reviewed_by/at and enqueues evaluate-compliance.
 */

export default async function ReviewPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="t-h2">Review queue</h1>
      <p className="t-secondary mt-4">Not implemented: PDF + parsed-field split view.</p>
    </main>
  );
}
