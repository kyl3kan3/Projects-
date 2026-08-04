/**
 * src/lib/theme.ts
 *
 * The one colour literal that cannot be a CSS custom property.
 *
 * `viewport.themeColor` is read by the browser chrome before any stylesheet
 * exists, so it has to be a literal string in the module graph. It is `kraft`
 * from DESIGN.md, and craft-check exempts this file by name for that reason.
 */

export const THEME_COLOR = "#f4f1e9";
