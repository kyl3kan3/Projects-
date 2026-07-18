// Shared UI primitives built exactly to DESIGN.md: PrimaryButton (ink fill,
// radius 6, h52), SecondaryButton (hairline), QuietAction (oxblood text),
// Card (radius 12), Sheet (radius 20, 45% scrim), RuledFormRow (Label + JBM
// field, hairline rules), LabelChip, TotalsStrip (oxblood total rule),
// SectionHeader (Label + JBM n/m), EmptyState (registrar voice).
//
// TODO:
// - [ ] Implement each primitive with tokens only — no literal hexes outside theme/tokens.ts
// - [ ] Press states: scale 0.98 + 8% fill dim + selection haptic (expo-haptics)
// - [ ] Disabled states per DESIGN.md (hairline fill, ink-3 text)
// - [ ] Touch targets ≥44px; Dynamic Type friendly line heights
export {};
