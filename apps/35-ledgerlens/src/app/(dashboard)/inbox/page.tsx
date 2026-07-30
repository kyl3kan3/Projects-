/**
 * src/app/(dashboard)/inbox/page.tsx
 *
 * The home screen: month header with hero total, filter chips, and the
 * document list. Mobile-first at 390px per DESIGN.md ("Inbox (home)").
 *
 * TODO:
 * - [ ] Server component: fetch current period documents + month total +
 *       needs-review count for the org.
 * - [ ] Header: Label month, IBM Plex Mono hero total, secondary counts
 *       line with flag dot.
 * - [ ] Chip row: All / Needs review / Confirmed (150ms crossfade).
 * - [ ] Document rows per DESIGN.md: thumbnail, vendor Title, mono amount,
 *       source line; flag dot vs ledger rule status at left.
 * - [ ] The settle rule animation on confirm (and its reduced-motion
 *       fallback: instant rule + color swap).
 * - [ ] Extracting rows: 1px underline shimmer + live status poll.
 * - [ ] Empty state: forwarding address with copy button + camera CTA.
 * - [ ] Thumb-zone primary button: Add receipt (camera flow).
 */

export default function InboxPage() {
  return null; // TODO: implement
}
