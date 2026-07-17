/**
 * /shifts/[id] — the shift close (DESIGN.md screen 2).
 *
 * Entries table with flag rows surfaced first and inline resolution
 * (match employee, fill hours); pool totals live; the Close button
 * runs compute-shares and the tally animation; post-close renders the
 * derivation strips.
 *
 * TODO: requireManager(); entries with flags; resolution actions;
 * close server action; shares view with DerivationStrip per
 * participant.
 */

export default async function ShiftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  void (await params);
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="t-h2">Shift close</h1>
      <p className="t-secondary mt-4">Not implemented: entries, flags, close, shares.</p>
    </main>
  );
}
