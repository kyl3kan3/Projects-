/**
 * src/app/pay/[token]/page.tsx
 *
 * The member portal -- no accounts, no passwords. A household's signed
 * link shows balance, payment, autopay enrollment, documents, and their
 * requests. DESIGN.md "Member portal" is the spec (same light theme).
 *
 * TODO:
 * - [ ] verifyPortalToken from params; typed error screens (expired ->
 *       "request a new link" flow, never a dead end).
 * - [ ] Balance panel: association header, current balance (mono),
 *       invoice history rows with PAID seals on settled invoices.
 * - [ ] Thumb-zone primary: **Set up autopay** until enrolled (the wedge
 *       -- first screen, every visit); then it shows enrollment state
 *       with pause/update quiet actions.
 * - [ ] Pay once: Stripe hosted checkout (ACH nudged first); return
 *       handling renders processing vs paid honestly.
 * - [ ] Autopay enrollment path: magic-link step-up BEFORE the
 *       SetupIntent screen (test proves the gate).
 * - [ ] My requests: member-visible issue timelines only (board_only
 *       events never render -- enforce serverside); file a new request
 *       with photos (camera-first).
 * - [ ] Documents: member-visible library entries with signed downloads.
 * - [ ] SMS preferences toggle (opt-in state, plain TCPA language).
 */

export default function PortalPage() {
  throw new Error("Not implemented");
}
