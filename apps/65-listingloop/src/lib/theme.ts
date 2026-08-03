/**
 * src/lib/theme.ts
 *
 * The one place a colour is written outside `globals.css`.
 *
 * Platform metadata — the `theme-color` meta tag and the web manifest — cannot
 * read a CSS custom property, so the manila ground has to exist as a literal
 * somewhere. It exists here, once, rather than being copied into three files
 * where they would drift apart.
 */

/** `--color-manila` from globals.css. Keep the two in step. */
export const THEME_COLOR = "#f5f1e6";
