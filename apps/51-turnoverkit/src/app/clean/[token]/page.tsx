/**
 * src/app/clean/[token]/page.tsx
 *
 * The cleaner's job page (ARCHITECTURE.md flow 2; DESIGN.md "Cleaner job
 * page"). Public token-keyed route: no account, no install, no password.
 * The most phone-bound surface in the product -- flawless one-handed.
 *
 * TODO:
 * - [ ] verifyJobToken(params.token); invalid/expired -> a calm dead-link
 *       page telling the cleaner to ask the host for a fresh link.
 * - [ ] Header sheet: unit name, access notes, window (mono).
 * - [ ] Room cards in template order: task rows with 24px tap targets,
 *       the photo rail (required slots as 64px dashed outlines that fill
 *       with thumbs), count "1 of 2" mono in spruce until met, green when
 *       met. Photos compress client-side -> signed PUT -> confirm.
 * - [ ] "Report a problem" from any room card (two taps, never blocks
 *       progress) -> issues row with photos.
 * - [ ] Sticky progress footer ("3 of 5 rooms · 7 photos"); progress
 *       persists via PATCH per room -- dropped connections resume.
 * - [ ] End-of-job stock counts (par items pre-listed, one tap per count),
 *       then Finish -- primary in the thumb zone, disabled until every
 *       room's photo gate is met, with the unmet room named ("Bath 2
 *       needs 1 photo"). Server enforces the gate again on submit.
 */

export default async function CleanerJobPage(_props: {
  params: Promise<{ token: string }>;
}) {
  return null; // TODO: implement
}
