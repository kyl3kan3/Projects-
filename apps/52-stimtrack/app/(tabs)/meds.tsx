/**
 * app/(tabs)/meds.tsx — Medications
 *
 * Prescription management (DESIGN.md "Meds"): rows grouped by time of day,
 * the trigger prescription pinned with its exact time, dose changes as
 * dated events, adherence week-dots.
 *
 * TODO:
 * - [ ] Prescription rows grouped by time of day; med row construction per
 *       DESIGN.md (glyph, Title, JBM dose/route, next-due / viridian check).
 * - [ ] Trigger prescription pinned at top: clock glyph, JBM exact time,
 *       links to /trigger; exactly one active trigger per cycle enforced.
 * - [ ] Add-med flow from src/data/meds library (+ custom); schedule editor
 *       writes schedule_json; library rows link their reference card.
 * - [ ] Dose change action: closes current prescription row, opens the next
 *       (dated event; markers on Labs charts). Never suggests a dose.
 * - [ ] Adherence week-dots per med from dose_log.
 * - [ ] 4th medication gate -> paywall (free tier: 3 meds).
 * - [ ] 5 a.m. flow: opening from a dose notification lands pre-scrolled to
 *       the due dose, 56px targets, two taps and done.
 * - [ ] Empty/ended-cycle states per DESIGN.md voice.
 */

export {};
