/**
 * src/app/(dashboard)/board/page.tsx
 *
 * The host's home screen: today's board (DESIGN.md "Board (home)").
 * Answers the only question that matters at 2pm on changeover day:
 * is every unit guest-ready before check-in?
 *
 * TODO:
 * - [ ] requireUser(); load today's turnovers across the host's units
 *       with unit, cleaner, window, status, and photo counts.
 * - [ ] Header: Label "SATURDAY · CHANGEOVER" + hero stat "5 of 6" units
 *       ready with the 4px hairline track filled green, Secondary line
 *       "1 in progress · next check-in 4:00 PM" (mono times).
 * - [ ] Filter chips: Today / Tomorrow / All units.
 * - [ ] BoardTile per unit (see components/BoardTile.tsx); collision and
 *       feed-error flags surface here honestly.
 * - [ ] The tile-flip signature fires on turnover completion (poll or
 *       stream); reduced-motion falls back to a direct state swap.
 * - [ ] Thumb-zone primary: "Add turnover" (manual gaps); "Run sync now"
 *       quiet action in the header.
 * - [ ] Empty state (no units yet): the three first-run cards -- add a
 *       unit, paste its iCal URL, invite a cleaner -- with real preview
 *       copy ("6 stays found, 2 turnovers scheduled").
 */

export default async function BoardPage() {
  throw new Error("Not implemented");
}
