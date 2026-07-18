/**
 * src/theme/useTheme.ts
 *
 * Theme hook/provider: resolves system color scheme to the token maps in
 * tokens.ts and exposes the loss-aware "neutral register" flag.
 *
 * TODO:
 * - [ ] useColorScheme -> light/dark token map; manual override stored in
 *       settings (system default).
 * - [ ] Expose reduced-motion flag (AccessibilityInfo) so components pick
 *       static countdown/motion variants.
 * - [ ] Expose neutralRegister(cycle): ended cycles render without accent
 *       or signal (DESIGN.md loss rules) — surfaces query this, not the raw
 *       status.
 * - [ ] Typed helper for text styles by role.
 */

export {};
