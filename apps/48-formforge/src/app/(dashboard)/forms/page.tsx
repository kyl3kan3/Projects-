/**
 * src/app/(dashboard)/forms/page.tsx
 *
 * The practice dashboard's intake status board + entry to the builder
 * (DESIGN.md "Intakes (practice home)"). Auth.js-protected, role-aware.
 *
 * TODO:
 * - [ ] Header: practice name + completion stat Label (`92% COMPLETION
 *       · 30D`).
 * - [ ] Status chip row (All / Awaiting / Signed / Overdue) filtering
 *       hairline intake rows: status dot, patient name, form +
 *       clinician, mono age right (overdue in clay).
 * - [ ] Pinned primary "Send intake" -> sheet with patient picker,
 *       form picker, channel toggles.
 * - [ ] Row tap -> intake detail (answers decrypt-on-read with audit,
 *       reminder history, export actions).
 * - [ ] Builder route: block cards with drag handles, config sheets,
 *       publish with mono version stamp.
 * - [ ] Empty state with real template-gallery copy (no lorem); loading
 *       and error states per DESIGN.md.
 * - [ ] Role gating: frontdesk sees status, not screener scores
 *       (configurable).
 */

export default function FormsPage() {
  throw new Error("Not implemented");
}
