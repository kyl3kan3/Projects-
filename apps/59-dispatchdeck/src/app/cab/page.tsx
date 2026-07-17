/**
 * /cab — the driver's whole world (DESIGN.md screen 1).
 *
 * Current load, rate in display type, next stop with window, THE
 * advancing button (56px), the hazard thread down the stop list, the
 * detention clock inline when arrived. One hand, arm's length.
 *
 * TODO:
 * - [ ] requireSession(); driver's active load (or the quiet empty
 *       state naming the parse address).
 * - [ ] Server action advance(loadId) with optimistic stamp + thread
 *       extension; POD camera flow gates "Delivered".
 * - [ ] Detention clock from lib/detention.detentionState, ticking
 *       client-side, amber past free window.
 */

export default async function CabPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <p className="t-placard">Current load</p>
      <h1 className="t-h2">Cab</h1>
      <p className="t-secondary mt-4">Not implemented: load card, thread, advance button, clock.</p>
    </main>
  );
}
