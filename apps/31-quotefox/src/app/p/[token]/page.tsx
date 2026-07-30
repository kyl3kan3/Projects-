/**
 * src/app/p/[token]/page.tsx
 *
 * Public hosted proposal page -- what the homeowner opens from the email.
 * Light theme (paper ground, ink actions) per DESIGN.md: contractor
 * branding + license block, scope, photos, line items, total, terms,
 * accept-and-pay flow. No login; the signed token is the credential.
 *
 * TODO:
 * - [ ] Verify token via src/lib/tokens.ts; friendly expired/withdrawn
 *       states (with "request a fresh link" contact line).
 * - [ ] Record first view -> proposal_events + contractor notification.
 * - [ ] Render scope, photo strip (presigned reads), hairline line-item
 *       rows with mono amounts, IPM total, terms, license/insurance block.
 * - [ ] Accept flow: typed-name signature + agreement checkbox ->
 *       src/lib/proposals.accept; then deposit Checkout redirect when the
 *       estimate carries one (src/lib/deposits.createDepositCheckout).
 * - [ ] Post-payment return state: "Deposit received" with receipt summary.
 * - [ ] Mobile-first 390px; AA contrast; no product chrome -- reads like
 *       fine paperwork, not an app.
 */

export default function ProposalPage(_props: {
  params: Promise<{ token: string }>;
}) {
  return null; // TODO: implement
}
