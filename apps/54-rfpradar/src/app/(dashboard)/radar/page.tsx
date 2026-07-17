/**
 * /radar — the capture dashboard's front page.
 *
 * Layout per DESIGN.md: the match queue (new matches sorted by score,
 * each a MatchCard with score + verbatim factors), the deadline rail
 * (next 14 days), and the source-health strip ("VA eVA: last success
 * 9h ago" — honest staleness, never silent).
 *
 * TODO:
 * - [ ] requireFirm(); server component queries: new matches w/
 *       opportunity join, upcoming deadlines, sources health.
 * - [ ] One-tap actions per match: pursue / watch / dismiss-with-reason
 *       (server actions; dismissal reason feeds profile tuning).
 * - [ ] Empty state = the quiet line, mirroring the morning scan.
 */

export default async function RadarPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="t-h2">Radar</h1>
      <p className="t-secondary">Not implemented: match queue, deadline rail, source health.</p>
    </main>
  );
}
