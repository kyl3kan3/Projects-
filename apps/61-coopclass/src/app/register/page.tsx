/**
 * /register — the family registration portal (DESIGN.md screen 3).
 *
 * Students as tabs, catalog filtered per grade band, capacity stamps
 * live, conflict blocks inline with the reason sentence, the running
 * family total with discount lines pinned in the footer. Mobile-first:
 * parents register from phones at 7pm.
 *
 * TODO:
 * - [ ] requireFamily(); window gate (tier-aware; a closed window
 *       shows the opening time, not a wall).
 * - [ ] Per-student class picker with live availability; enroll/drop
 *       server actions rendering EnrollmentError sentences inline.
 * - [ ] Footer running total re-runs pricing.buildInvoice preview.
 * - [ ] "Review & pay" -> checkout summary page.
 */

export default async function RegisterPage() {
  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <h1 className="t-h2">Registration</h1>
      <p className="t-secondary mt-4">Not implemented: student tabs, catalog, total footer.</p>
    </main>
  );
}
