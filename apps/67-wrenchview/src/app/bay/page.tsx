/**
 * /bay — the tablet inspection flow (DESIGN.md screen 1).
 *
 * One item at a time: item label huge, the 64px verdict rail, camera,
 * measurement keypad, note; progress strip; swipe next/back. Must
 * beat paper.
 *
 * TODO: requireDevice(); assigned in_progress inspections; the item
 * stepper with optimistic writes; presigned photo uploads that never
 * block the next tap; tech_done handoff.
 */

export default async function BayPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <p className="t-placard">Bay 2</p>
      <h1 className="t-h2">Inspection</h1>
      <p className="t-secondary mt-4">Not implemented: item stepper, verdict rail, camera.</p>
    </main>
  );
}
