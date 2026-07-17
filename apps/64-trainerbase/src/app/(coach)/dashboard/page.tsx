/**
 * /dashboard — the adherence dashboard (DESIGN.md screen 1).
 *
 * Rows per client: yesterday's tick row, program position, drift flag
 * in whistle, check-ins waiting. Sorted drifting-first. The coach's
 * morning screen.
 *
 * TODO: requireTrainer(); adherence.dashboardRows; TickRow per client;
 * drift rows pinned top with the flag sentence.
 */

export default async function DashboardPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="t-h2">This morning</h1>
      <p className="t-secondary mt-4">Not implemented: adherence rows, drift flags.</p>
    </main>
  );
}
