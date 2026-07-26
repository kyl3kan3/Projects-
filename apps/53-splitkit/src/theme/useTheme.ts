// Theme hook + provider — resolves the active color scheme (system automatic,
// per app.json userInterfaceStyle) to the Ledger light/dark palette from
// tokens.ts and exposes it to every component. Also exposes reduced-motion.
//
// TODO:
// - [ ] ThemeProvider wrapping the root layout; useColorScheme() → palette selection
// - [ ] useTheme(): { palette, type, spacing, radii, reducedMotion }
// - [ ] useReducedMotion() from AccessibilityInfo, feeding the seal animation fallback
export {};
