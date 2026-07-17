/**
 * /orders/new — the quote builder (DESIGN.md screen 2).
 *
 * Event window picker at top drives everything; item lines render live
 * chalk gauges for that window; overbooked lines block inline with the
 * conflicting order named; totals + deposit footer.
 *
 * TODO:
 * - [ ] requireSession(); item search with availability batch query.
 * - [ ] Line editor client component (quantity steppers re-run the
 *       gauge with the 180ms fill).
 * - [ ] Save draft / send actions (send emails the /q/[token] link).
 */

export default async function NewOrderPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="t-h2">New quote</h1>
      <p className="t-secondary mt-4">Not implemented: window picker, lines, gauges, totals.</p>
    </main>
  );
}
