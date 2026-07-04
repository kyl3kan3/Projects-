/**
 * src/app/portal/[token]/page.tsx
 *
 * The client payment portal — the page a client lands on from a follow-up
 * email. No login; the signed token in the URL is the credential. Renders
 * as the FIRM's stationery (their name in Source Serif, our footer line),
 * per DESIGN.md "Client portal" spec.
 *
 * TODO:
 * - [ ] Resolve token via src/lib/portal.resolveToken; expired/invalid ->
 *       a polite dead-link page with a "request a fresh link" action.
 * - [ ] Balance hero (mono), invoice list with PDF links, payment history.
 * - [ ] Pay button -> Stripe Elements (card + ACH), partial amounts allowed
 *       above the configured floor; thumb-zone placement at 390px.
 * - [ ] Promise widget: "I'll pay on <date>" -> logs promise, pauses the
 *       sequence, confirms inline.
 * - [ ] Success state: the settle rule animation + receipt email trigger.
 */

export default function PortalPage(_props: {
  params: Promise<{ token: string }>;
}) {
  // TODO: implement per DESIGN.md and ARCHITECTURE.md key flow 3
  return null;
}
