/**
 * src/app/(dashboard)/positions/page.tsx
 *
 * The home screen: exposure-sorted positions (DESIGN.md "Positions").
 * Answers the morning question: where do I stand, and where am I
 * bleeding?
 *
 * TODO:
 * - [ ] requireUser(); load SKUs with ladders, exposures, unseen
 *       overnight change events, and page-health flags.
 * - [ ] Header: Label "TUESDAY · 7:04 AM" + hero stat "31 of 34" SKUs in
 *       position (4px hairline track filled green), Secondary "3
 *       undercut · 1 page blocked".
 * - [ ] The overnight-reveal signature plays when unseen changes exist:
 *       header stamp -> price ticks -> marker slides -> exposure chips
 *       land; reduced-motion falls back per DESIGN.md. Mark events seen
 *       after the reveal.
 * - [ ] Exposure chips (All / Undercut / Attention / Handled), then SKU
 *       rows sorted by exposure (undercut-and-losing first).
 * - [ ] Thumb-zone primary: "Track a page"; "Run checks now" quiet
 *       action in the header.
 * - [ ] Empty state (no SKUs yet): the three first-run cards -- import
 *       SKUs, track the first page (ends on the extraction preview),
 *       connect Slack.
 */

export default async function PositionsPage() {
  throw new Error("Not implemented");
}
