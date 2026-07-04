/**
 * src/app/register/[season]/page.tsx
 *
 * Public season registration page — the link the club posts everywhere.
 * Daylight theme (parents outdoors at 2pm), one child per screen, under
 * 5 minutes on a phone. See DESIGN.md "Parent registration".
 *
 * TODO:
 * - [ ] Season/division picker with capacity + waitlist state shown
 *       honestly ("U10 Boys: 3 spots left").
 * - [ ] Multi-step form (household -> player -> medical/emergency ->
 *       waiver), progress dots, zod validation per step, one thumb-zone
 *       primary per screen.
 * - [ ] Waiver acknowledgment inline (full text, real checkbox, timestamp);
 *       explicit SMS consent checkbox (unchecked by default).
 * - [ ] Fee summary in mono with sibling discount and our fee line shown
 *       honestly; Stripe Checkout handoff.
 * - [ ] Waitlist path: no charge, clear copy about promotion.
 * - [ ] Closed-season state: polite, with the club's contact.
 */

export default function RegisterPage(_props: {
  params: Promise<{ season: string }>;
}) {
  // TODO: implement per DESIGN.md and ARCHITECTURE.md key flow 1
  return null;
}
