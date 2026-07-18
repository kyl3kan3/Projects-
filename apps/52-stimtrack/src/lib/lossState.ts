/**
 * src/lib/lossState.ts
 *
 * The loss-aware engine (ARCHITECTURE.md flow 5) — the moral core of the
 * product and never behind the paywall.
 *
 * TODO:
 * - [ ] endCycle(cycleId, reason): single transaction — set status 'ended' +
 *       ended_reason + ended_at, cancel ALL pending notifications for the
 *       cycle (notifications.cancelForCycle, verified), record silenced_at.
 * - [ ] Typed reasons: completed / cancelled / no_fertilization /
 *       no_transfer / transfer_failed / pregnancy_ended / converted / other.
 * - [ ] Register resolver: is this cycle in the neutral register? (drives
 *       useTheme.neutralRegister — no accent, no signal, no motion, neutral
 *       copy strings.)
 * - [ ] Copy table: neutral-register strings ("Everything is quiet now.
 *       Your data is kept until you decide otherwise.") — reviewed with
 *       lived-experience testers per ROADMAP before ship.
 * - [ ] Archive semantics: ended cycles leave Today/Calendar defaults but
 *       remain fully readable + exportable; nothing deleted without a
 *       separate explicit action.
 * - [ ] Guarantee: no future notification, prompt, or re-engagement may
 *       reference an ended cycle — provide the assertion used in tests.
 * - [ ] Next-cycle handoff: starting a new cycle copies nothing unless the
 *       user opts in (meds list, clinic).
 */

export {};
