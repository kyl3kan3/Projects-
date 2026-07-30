/**
 * src/app/(dashboard)/dues/page.tsx
 *
 * Board home: the dues screen. Mobile-first at 390px per DESIGN.md
 * ("Dues (home)").
 *
 * TODO:
 * - [ ] Server component: current period collected-vs-expected, aging
 *       buckets, household rows.
 * - [ ] Header: Label period ("Q2 DUES"), mono hero stat with the 4px
 *       green-filled progress track, outstanding summary line.
 * - [ ] Aging chips (All / 30 / 60 / 90+), then household rows per
 *       DESIGN.md (unit + name, mono balance, status line, aging dot).
 * - [ ] The seal + countdown signature on settlement events (webhook-
 *       driven refresh) with the reduced-motion fallback.
 * - [ ] Household detail route: invoice history, autopay state, record-
 *       a-check flow (two taps), late-fee apply/waive, payment plan.
 * - [ ] Thumb-zone primary: **Record a payment**; **Run reminders** as
 *       header secondary (confirm sheet shows exactly who gets what).
 * - [ ] Empty state: the three first-run cards (import roster, connect
 *       Stripe, create assessment -> the invoice-run preview).
 */

export default function DuesPage() {
  return null; // TODO: implement
}
