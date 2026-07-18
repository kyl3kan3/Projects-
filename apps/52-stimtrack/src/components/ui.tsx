/**
 * src/components/ui.tsx
 *
 * Core components built exactly to DESIGN.md's "Component construction":
 * buttons, rows, sheets, labels, chips.
 *
 * TODO:
 * - [ ] PrimaryButton: ink fill / paper text (light), off-white fill / ink
 *       text (dark); radius 8, height 52, Inter 600 16; press scale 0.98 +
 *       selection haptic; disabled hairline/ink-3.
 * - [ ] SecondaryButton (hairline), QuietAction (viridian text, 75% press).
 * - [ ] HoldToConfirmButton: 1200ms fill + success haptic (the trigger
 *       confirm; reduced-motion = plain confirm tap with system confirm).
 * - [ ] ProtocolDayRow: JBM CD column, glyph, Title, right JBM time; today
 *       2px viridian left rule; trigger day 2px signal left rule.
 * - [ ] MedRow: 64px, kind glyph, Title + JBM dose/route, next-due JBM /
 *       viridian check / signal overdue; inline Taken/Skip 44px targets.
 * - [ ] StorageCard, Label (11/600/+0.9 uppercase), Sheet (radius 20, 45%
 *       scrim), value fields (JBM 36 numeric), follicle chips.
 * - [ ] Every component consumes tokens.ts only; neutral-register variants
 *       (no accent/signal) for ended cycles.
 */

export {};
