/**
 * src/theme/tokens.ts
 *
 * The design tokens — the only place DESIGN.md hexes/sizes live in code.
 * Both modes ship: light "Porcelain lab" (primary) and dark "graphite
 * lab-at-night."
 *
 * Token names (values come verbatim from DESIGN.md — no other colors exist):
 *   color.light: paper #F7F5F1 · card #FFFFFF · hairline #E4E1D8 ·
 *                ink #1B1D1B · ink2 #5A605B · ink3 #9AA09A ·
 *                viridian #2E6B5C · signal #B4432A
 *   color.dark:  paper #161817 · card #1F2220 · hairline #31352F ·
 *                ink #ECEDE8 · ink2 #A4AAA2 · ink3 #6C726B ·
 *                viridian #5C9E8B · signal #D96A4E
 *   pdf:         paper #FDFCF9 · ink #1B1D1B · accent #2E6B5C (theme-agnostic)
 *   space:       4 8 12 16 24 32 48 64 · gutter 20
 *   radius:      control 8 · card 12 · sheet 20 (nothing else)
 *   type roles:  display / h2 / title / body / secondary / label / data /
 *                bigDatum / countdown / button — exact size/lh/tracking per
 *                DESIGN.md specimen; faces Archivo / Inter / JetBrainsMono
 *   motion:      state 200ms ease-out · nav 300ms ease-in-out · micro 120ms
 *
 * TODO:
 * - [ ] Export typed ColorMode maps for both modes (exact hexes above).
 * - [ ] Export space scale, radii (exactly three), and gutter.
 * - [ ] Export type roles with fontFamily/size/lineHeight/tracking/weight;
 *       all data roles get fontVariant tabular-nums.
 * - [ ] Export motion durations/easings + reduced-motion variants.
 * - [ ] Export the theme-agnostic PDF palette for the summary builder.
 * - [ ] No other color values may exist anywhere in src/ or app/.
 */

export {};
