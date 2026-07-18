// Design tokens — the only source of color/type/spacing in the app.
// Identity: "Ledger" — the register of a beautifully kept legal ledger. Bone
// paper grounds, graphite-black ink, ONE oxblood mark for what has been
// recorded, verdigris strictly semantic (resolved/secured). Light is the hero
// expression; dark is the charcoal reading-room. Exact hexes live in DESIGN.md;
// no other hex values may appear anywhere in src/ or app/.
//
// Token names (both modes):
//   paper      — the ground of every screen (light #F4F1E8 / dark #171614)
//   card       — raised surfaces               (#FBF9F1 / #211F1C)
//   hairline   — 1px dividers & ledger rules   (#DCD6C6 / #37342D)
//   ink        — primary text                  (#201E19 / #EAE6D9)
//   ink2       — secondary text                (#5A564A / #A39D8D)
//   ink3       — faint/placeholder/disabled    (#8F8A7A / #6C675A)
//   oxblood    — THE recorded mark, ≤10%       (#6E2B33 / #B45A60)
//   verdigris  — semantic resolved/secured     (#3E6B52 / #7CA98C)
//   buttonFill / buttonText / buttonPressed — per DESIGN.md button spec
//
// Type roles: display (SourceSerif4 700 30/36), h2 (SourceSerif4 600 21/27),
// title (Inter 500 17/22), body (Inter 400 16/24), secondary (Inter 400 14/20),
// label (Inter 600 11/13 +0.9 uppercase), data (JBM 500 14/17 tabular),
// hashline (JBM 500 12/16 +0.2), bigDatum (JBM 600 34/34), button (Inter 600 16/16).
//
// Spacing scale: 4 8 12 16 24 32 48 64; gutter 20. Radii: 6 / 12 / 20 only.
//
// TODO:
// - [ ] Export Palette interface + light/dark palette objects with the exact hexes above
// - [ ] Export type-role StyleSheet fragments (fontFamily names must match expo-font keys)
// - [ ] Export spacing, radii, gutter constants
// - [ ] Export motion durations (state 200ms, nav 300ms, seal sequence timings) + reduced-motion flags
export {};
