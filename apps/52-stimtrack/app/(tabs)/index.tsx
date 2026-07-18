/**
 * app/(tabs)/index.tsx — Today
 *
 * The daily operating surface (DESIGN.md "Today"): cycle-day headline,
 * countdown band inside T−24h, today's protocol events, today's meds with
 * inline logging, prep-note quick add.
 *
 * TODO:
 * - [ ] Display headline: "Cycle day N — stim day M" (Archivo 700 30) + date;
 *       cycle-day math from repositories' derived views.
 * - [ ] Countdown band when a trigger is set and now >= T−24h: full-width,
 *       JBM remaining time, taps into /trigger.
 * - [ ] Today's protocol_event rows (day-row construction per DESIGN.md);
 *       trigger day carries the 2px signal left rule.
 * - [ ] Today's due doses as med rows with inline Taken/Skip (44px targets,
 *       haptic on log); overdue flips time to signal.
 * - [ ] "Log a scan" quiet action after monitoring events -> scan-entry sheet.
 * - [ ] Prep-note quick add ("Ask about the Menopur dose").
 * - [ ] States: no active cycle (start-cycle CTA), planning cycle, ended
 *       cycle (neutral register, archive link), loading, error.
 * - [ ] Seeded demo cycle renders a believable day-9 stim day (no lorem).
 */

export {};
