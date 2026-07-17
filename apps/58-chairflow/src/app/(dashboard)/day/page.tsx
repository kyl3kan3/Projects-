/**
 * /day — the stylist's day view (their home screen).
 *
 * Today's appointments as rows; ended-unmarked appointments surface the
 * three-way prompt (Completed / No-show / Late grace) inline — marking
 * no-show enqueues capture-fee and the row shows the charge's live
 * status. The protection ledger's running "paid for itself" number sits
 * in the header.
 *
 * TODO:
 * - [ ] requireStylist(); rows in stylist-local time.
 * - [ ] Mark actions as server actions; optimistic status flip; charge
 *       chip states: charging -> charged $X / failed (retry link) /
 *       waived.
 * - [ ] One-tap waive on any fee row with an undo toast (10s).
 */

export default async function DayPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="t-h2">Today</h1>
      <p className="t-secondary mt-4">Not implemented: appointment rows, mark prompt, ledger header.</p>
    </main>
  );
}
