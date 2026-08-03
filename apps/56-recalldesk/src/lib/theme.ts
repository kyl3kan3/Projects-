/**
 * src/lib/theme.ts
 *
 * The one place a palette value is duplicated outside `globals.css`.
 *
 * Platform metadata — the browser theme colour, the web-app manifest — is read by
 * the operating system before any stylesheet exists, so it cannot reference a CSS
 * custom property. Rather than let three files each hardcode a hex, they all read
 * this constant, and `tools/craft-check.mjs` allows a colour literal here and
 * nowhere else.
 *
 * If DESIGN.md's `porcelain` ever changes, it changes in globals.css and here.
 */

/** DESIGN.md `porcelain` — the app ground. */
export const THEME_COLOR = "#f4f6f7";
