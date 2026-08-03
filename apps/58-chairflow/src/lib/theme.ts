/**
 * src/lib/theme.ts
 *
 * The one place a colour literal lives outside `globals.css`.
 *
 * Platform metadata — the viewport `themeColor` and the web manifest — is consumed by
 * the browser chrome before any stylesheet is parsed, so it cannot be a CSS custom
 * property. It is DESIGN.md's `paper`, and `tools/craft-check.mjs` allows this file by
 * name for exactly that reason.
 */

/** DESIGN.md `paper` — the ground of every screen. */
export const THEME_COLOR = "#f5f6f8";
