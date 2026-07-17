/**
 * /loads — the office board (DESIGN.md screen 2).
 *
 * Dense list or status columns (toggle): reference, broker, lane in
 * Plex Mono (ORIG -> DEST), rate, thread-position glyph, age. Filters:
 * status, truck, broker.
 *
 * TODO:
 * - [ ] requireRole("owner" | "dispatcher").
 * - [ ] Server component query with joins; LoadRow client component.
 * - [ ] "Needs attention" rail: pending rate-con drafts, delivered
 *       loads without packets, invoices past terms.
 */

export default async function LoadsPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="t-h2">Loads</h1>
      <p className="t-secondary mt-4">Not implemented: board, filters, attention rail.</p>
    </main>
  );
}
