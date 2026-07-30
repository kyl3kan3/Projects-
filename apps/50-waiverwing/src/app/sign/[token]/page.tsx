/**
 * src/app/sign/[token]/page.tsx
 *
 * The customer-facing signing flow (DESIGN.md "Signing flow") -- QR,
 * kiosk sessions, and emailed links all land here. Mobile-first,
 * one-handed in a queue.
 *
 * TODO:
 * - [ ] Resolve token via lib/qr; rotated/expired -> calm dead-end page
 *       ("Ask the front desk for a new code"), no venue data leaked.
 * - [ ] Adult flow: contact fields, custom questions, waiver text in
 *       its framed scroll region, initialed clauses, typed/drawn
 *       signature with disclosure gate.
 * - [ ] Guardian flow: stepper (GUARDIAN -> MINORS -> SIGN) per
 *       DESIGN.md; add-another-minor; final action names the minors
 *       ("Sign for Maya and Leo").
 * - [ ] Age validation via lib/minors; minors as signers hard-rejected
 *       with plain-language explanation.
 * - [ ] The blaze on completion (DESIGN.md signature detail) +
 *       reduced-motion fallback; receipt email trigger.
 * - [ ] Server-rendered-first; drawn signature degrades to typed.
 * - [ ] Kiosk variant: larger type/targets, offline_key generation,
 *       outbox write when offline, auto-reset handoff.
 */

export default function SignPage() {
  return null; // TODO: implement
}
