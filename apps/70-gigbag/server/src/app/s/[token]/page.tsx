/**
 * /s/[token] — the music-stand setlist view (DESIGN.md screen 4).
 *
 * Black screen, huge houselight type, key + BPM per song, set breaks,
 * screen-wake. Readable from four feet on a dim stage.
 *
 * TODO: token verify; the big-type list; wake lock; set tabs.
 */

export default async function SetlistSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  void (await params);
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="t-h2">Setlist</h1>
      <p className="t-secondary mt-4">Not implemented: the music-stand view.</p>
    </main>
  );
}
