/**
 * /t/[handle] — the client PWA's today screen (DESIGN.md screen 5).
 *
 * Today's workout resolved with substitutions: exercise rows, demo
 * links, set dashes -> ticks, weight/rep steppers (56px), the rest
 * arc, note-to-coach. Offline banner shows the outbox count.
 *
 * TODO: requireClient(); programs.resolveDay + todayFor; SetRow client
 * components wired to outbox.enqueue; completion flow; PWA manifest +
 * service worker registration.
 */

export default async function TodayPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  void (await params);
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <p className="t-placard">Today</p>
      <h1 className="t-h2">Upper A</h1>
      <p className="t-secondary mt-4">Not implemented: rows, ticks, steppers, rest arc.</p>
    </main>
  );
}
