/**
 * Output escaping for the embed.
 *
 * This module is the security boundary of the whole product. Review text is
 * written by strangers on the internet and rendered inside *someone else's*
 * storefront, next to their checkout. A single unescaped `<` is a stored XSS on
 * a merchant's payment pages, which would end the company.
 *
 * Three separate contexts need three separate escapes, and they are not
 * interchangeable:
 *
 *   1. HTML text and quoted attributes  -> `escapeHtml`
 *   2. URLs in `src` / `href`           -> `safeUrl` (scheme allow-list), then `escapeHtml`
 *   3. JSON inside a `<script>` element -> `jsonForScript` (`<`, `>`, `&`, U+2028/9)
 *
 * Every function here is pure and synchronous so it can be unit-tested against
 * real attack payloads without a DOM. See escape.test.ts.
 */

/** Characters that can end an HTML text node or a quoted attribute value. */
const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  // Backtick: IE <= 8 accepted it as an attribute delimiter. Cheap to keep out.
  "`": "&#96;",
};

/**
 * Escape for HTML text nodes *and* double- or single-quoted attribute values.
 * `&` must be replaced first, which a single character-class pass guarantees.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"'`]/g, (c) => HTML_ESCAPES[c]);
}

/**
 * Attribute values get the same treatment as text. Kept as a distinct name so
 * call sites read as deliberate rather than accidentally correct.
 */
export const escapeAttr = escapeHtml;

/**
 * Allow-list URL scheme check. Anything that is not plainly http(s) or a
 * root-relative path becomes null: `javascript:`, `data:`, `vbscript:`, and the
 * whitespace/control-character tricks used to smuggle them past naive filters.
 */
export function safeUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // Browsers strip control characters and spaces before parsing a URL's scheme,
  // so `java\tscript:alert(1)` executes. Strip them first, then test.
  const cleaned = raw.replace(/[\u0000-\u0020\u00a0\u1680\u2000-\u200f\u2028\u2029\u202f\u205f\u3000\ufeff]+/g, "");
  if (!cleaned) return null;
  // Root-relative is always safe: it can only address the host page's own origin.
  if (cleaned.startsWith("/") && !cleaned.startsWith("//")) return cleaned;
  if (/^https?:\/\/[^/\\]/i.test(cleaned)) return cleaned;
  return null;
}

/**
 * Serialise JSON for embedding inside a `<script>` element.
 *
 * `JSON.stringify` alone is not enough: the string `</script>` inside a review
 * body closes the element, and everything after it becomes markup. Escaping
 * `<`, `>` and `&` as unicode escapes keeps the JSON valid and inert. U+2028 and
 * U+2029 are escaped too — they are legal inside a JSON string but terminate a
 * line in JavaScript source, which corrupts the block.
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * A CSS colour that is safe to interpolate into a `<style>` block: 3-, 6- or
 * 8-digit hex only. Theme values are merchant-supplied rather than
 * shopper-supplied, but a `</style>` in one would still break out of the CSS
 * context, and a stylesheet can exfiltrate data on its own.
 */
export function safeColor(raw: unknown, fallback: string): string {
  if (typeof raw === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(raw.trim())) {
    return raw.trim();
  }
  return fallback;
}

/** A CSS length that is safe to interpolate: a bounded whole number of px. */
export function safePx(raw: unknown, fallback: number, min = 0, max = 64): number {
  const n = typeof raw === "number" ? raw : Number.parseFloat(String(raw ?? ""));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * Collapse a string to a bounded length on a word boundary. Not a security
 * control — a defence against one 40,000-character review blowing the payload
 * budget the widget is sold on.
 */
export function clamp(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
