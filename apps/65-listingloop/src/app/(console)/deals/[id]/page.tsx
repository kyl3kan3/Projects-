/**
 * /deals/[id] — the deal file (DESIGN.md screen 2).
 *
 * The timeline full-width on top (DealLine), then checklist with doc
 * placeholders, parties rail, commission lines, activity log. One
 * screen, the whole file.
 *
 * TODO: requireSession(); joins for dates/tasks/parties/docs; anchor
 * edit sheet with diff preview; task complete/na actions.
 */

export default async function DealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  void (await params);
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="t-h2">Deal file</h1>
      <p className="t-secondary mt-4">Not implemented: timeline, checklist, parties, lines.</p>
    </main>
  );
}
