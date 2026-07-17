/**
 * /r/[token] — the customer report (DESIGN.md screen 4).
 *
 * Paper ground: shop header, vehicle, urgency groups (Now/Soon/
 * Watch) with full-bleed photos, each estimate line's Approve/
 * Decline, sticky running total, submit -> approvals trail. Mobile-
 * first, no login, reads like a clear letter.
 *
 * TODO: verifyReportToken (stamps first_viewed_at); decision toggles
 * with the counting total; submit -> approvals.recordDecisions with
 * request meta; expired page shows the shop's phone.
 */

export default async function ReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  void (await params);
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <h1 className="t-h2">Your inspection</h1>
      <p className="t-secondary mt-4">Not implemented: findings, approvals, running total.</p>
    </main>
  );
}
