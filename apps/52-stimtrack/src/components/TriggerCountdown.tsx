/**
 * src/components/TriggerCountdown.tsx
 *
 * The signature component (DESIGN.md "The signature"): the full-screen
 * countdown face and the Today countdown band. The one moment the app
 * raises its voice.
 *
 * TODO:
 * - [ ] CountdownFace: card on paper, "TRIGGER" Label, clinic time in JBM
 *       Data, remaining time in JBM 600 64 tabular digits ticking per
 *       second; hairline ring filling clockwise toward T−0.
 * - [ ] T−1h state: digits + ring switch ink -> signal; soft haptic pulse
 *       each minute (the only large signal moment in the product).
 * - [ ] Confirmed state: ring completes in viridian, digits stop,
 *       "Confirmed HH:MM" JBM line beneath; stands down to calm register.
 * - [ ] CountdownBand (Today): full-width compact variant, JBM remaining
 *       time, navigates to /trigger.
 * - [ ] Timer correctness: derive from trigger_at vs now on every tick and
 *       on foreground (no drift from suspended JS timers).
 * - [ ] Reduced motion: static minute-refresh text, no ring, no flicker.
 * - [ ] VoiceOver: announce at T−1h/T−15m/T−0 style intervals, not per tick.
 */

export {};
