/**
 * src/app/portal/[token]/page.tsx
 *
 * The no-login sub portal -- the adoption wedge. One page, light theme,
 * phone-first at 390px per DESIGN.md ("Sub portal"). A sub in a truck must
 * be able to view scope, download plans, and submit a bid in minutes.
 *
 * TODO:
 * - [ ] verifyPortalToken from params; typed error screens for expired /
 *       revoked / invalid (with a "request a new link" mailto).
 * - [ ] Render: GC branding header, project + trade, due countdown (mono),
 *       scope notes, plan file list (signed downloads), Q&A thread.
 * - [ ] Bid form: the GC's bid_form_lines with mono amount inputs
 *       (numeric keypad), excluded / included-in-line-N options, add-row
 *       free-form entries, inclusion/exclusion chips, notes, attachment
 *       upload (signed PUT).
 * - [ ] Running total (mono) updates live above the thumb-zone
 *       **Submit bid** primary; lump-sum fallback path visible.
 * - [ ] Draft persistence against the invitation; resubmission before due
 *       date creates a new revision.
 * - [ ] Plain statement: "Your numbers are never shown to other bidders."
 * - [ ] Confirmation screen with a summary the sub can screenshot.
 * - [ ] Never render any other sub's data (scoping enforced serverside;
 *       test in Phase 1 acceptance).
 */

export default function PortalPage() {
  return null; // TODO: implement
}
