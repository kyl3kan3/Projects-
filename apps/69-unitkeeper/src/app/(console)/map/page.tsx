/**
 * /map — the facility map (DESIGN.md screen 1).
 *
 * The grid from map_position; status fills (vacant outline, occupied
 * galv, overdue rolldoor, lien liencard); the occupancy header line;
 * filter chips; click-through to unit files.
 *
 * TODO: requireOwner(); UnitMap component with the door-flip wipe on
 * status changes; the map editor mode (rows/sizes/drag).
 */

export default async function MapPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="t-h2">The yard</h1>
      <p className="t-secondary mt-4">Not implemented: unit grid, filters, occupancy line.</p>
    </main>
  );
}
