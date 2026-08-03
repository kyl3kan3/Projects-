/**
 * The one place a colour is written as a literal outside globals.css.
 *
 * Browser-chrome and PWA metadata (`viewport.themeColor`, the manifest's
 * `background_color` and `theme_color`) is read by the operating system before any
 * stylesheet exists, so it cannot be a CSS custom property. It is `concrete` from
 * DESIGN.md's palette, and `tools/craft-check.mjs` grants this file — and only this
 * file — the exception.
 */

/** DESIGN.md `concrete` — the app ground. */
export const THEME_COLOR = "#efeeea";
