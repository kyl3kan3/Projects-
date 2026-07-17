/**
 * /grid — the schedule grid (DESIGN.md screen 2).
 *
 * Periods x rooms matrix, ruled like ledger paper; each cell a class
 * card with its capacity stamp; drag between cells re-checks room/
 * teacher conflicts and blocks in brick with the collision named.
 *
 * TODO:
 * - [ ] requireStaff(); term switcher.
 * - [ ] Server component grid + client drag layer (optimistic move,
 *       server action validation, snap-back on conflict).
 */

export default async function GridPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="t-h2">Schedule grid</h1>
      <p className="t-secondary mt-4">Not implemented: periods x rooms matrix.</p>
    </main>
  );
}
