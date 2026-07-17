/**
 * /day — the one-thumb screen (DESIGN.md screen 1).
 *
 * Ratio header ("6 of 8 here"), child chips in arrival order with
 * their day ribbons, the big tap row for the selected child
 * (Arrive/Meal/Nap/Diaper/Photo/Note), house-event row. ≥52px
 * targets; everything reachable with a thumb.
 *
 * TODO: requireProvider(); expected-children from schedules; tap
 * actions -> logging.appendEvent with optimistic ribbon marks + the
 * bloom; the meal sheet; photo presign flow.
 */

export default async function DayPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <p className="t-placard">Today</p>
      <h1 className="t-h2">The day</h1>
      <p className="t-secondary mt-4">Not implemented: ratio header, chips, tap row.</p>
    </main>
  );
}
