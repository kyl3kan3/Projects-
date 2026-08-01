/**
 * Escaping tests.
 *
 * These are the most important tests in the repository. The widget renders text
 * written by anonymous shoppers into a third party's storefront; if any of these
 * assertions stops holding, every merchant using TrustBadge is serving stored XSS
 * on their own product and checkout pages.
 *
 * Each case is a payload that has actually been used against review widgets in
 * the wild, not a synthetic "<script>" smoke test.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clamp,
  escapeAttr,
  escapeHtml,
  jsonForScript,
  safeColor,
  safePx,
  safeUrl,
} from "@/widget/escape";

describe("escapeHtml", () => {
  it("neutralises a script tag", () => {
    assert.equal(
      escapeHtml('<script>alert("xss")</script>'),
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;",
    );
  });

  it("escapes ampersands first, so entities cannot be smuggled in", () => {
    // If `<` were replaced before `&`, "&lt;" in the input would become "&&lt;t;"
    // and a browser would decode it back into a real "<".
    assert.equal(escapeHtml("&lt;script&gt;"), "&amp;lt;script&amp;gt;");
    assert.equal(escapeHtml("&amp;"), "&amp;amp;");
  });

  it("closes the attribute-breakout vectors", () => {
    assert.equal(
      escapeHtml('" onmouseover="alert(1)'),
      "&quot; onmouseover=&quot;alert(1)",
    );
    assert.equal(escapeHtml("' onfocus='alert(1)"), "&#39; onfocus=&#39;alert(1)");
    assert.equal(escapeHtml("`backtick`"), "&#96;backtick&#96;");
  });

  it("survives the classic img/svg onerror payloads", () => {
    const out = escapeHtml('<img src=x onerror=alert(1)><svg/onload=alert(1)>');
    assert.ok(!out.includes("<"));
    assert.ok(!out.includes(">"));
    assert.ok(out.includes("onerror=alert(1)")); // inert as text, which is the point
  });

  it("passes ordinary review text through unharmed", () => {
    const body = "Beautiful weight, washes well — I ordered two more.";
    assert.equal(escapeHtml(body), body);
  });

  it("treats null and undefined as empty, never as the string 'null'", () => {
    assert.equal(escapeHtml(null), "");
    assert.equal(escapeHtml(undefined), "");
    assert.equal(escapeHtml(0), "0");
    assert.equal(escapeHtml(false), "false");
  });

  it("is the same function as escapeAttr", () => {
    assert.equal(escapeAttr, escapeHtml);
  });
});

describe("safeUrl", () => {
  it("accepts http, https, and root-relative paths", () => {
    assert.equal(safeUrl("https://cdn.example.com/a.jpg"), "https://cdn.example.com/a.jpg");
    assert.equal(safeUrl("http://example.com/a.jpg"), "http://example.com/a.jpg");
    assert.equal(safeUrl("/api/media/abc"), "/api/media/abc");
  });

  it("rejects javascript: in every disguise", () => {
    assert.equal(safeUrl("javascript:alert(1)"), null);
    assert.equal(safeUrl("JaVaScRiPt:alert(1)"), null);
    // Browsers strip control characters before parsing the scheme, so these run
    // if the filter only does a literal prefix check.
    assert.equal(safeUrl("java\tscript:alert(1)"), null);
    assert.equal(safeUrl("java\nscript:alert(1)"), null);
    assert.equal(safeUrl("java\u0000script:alert(1)"), null);
    assert.equal(safeUrl("  javascript:alert(1)"), null);
    assert.equal(safeUrl("\u0001javascript:alert(1)"), null);
  });

  it("rejects data:, vbscript:, and file:", () => {
    assert.equal(safeUrl("data:text/html;base64,PHNjcmlwdD4="), null);
    assert.equal(safeUrl("data:image/svg+xml,<svg onload=alert(1)>"), null);
    assert.equal(safeUrl("vbscript:msgbox(1)"), null);
    assert.equal(safeUrl("file:///etc/passwd"), null);
  });

  it("rejects protocol-relative URLs, which inherit the host page's scheme", () => {
    assert.equal(safeUrl("//evil.example.com/a.js"), null);
  });

  it("rejects a scheme with a backslash authority", () => {
    assert.equal(safeUrl("https:/\\evil.example.com"), null);
    assert.equal(safeUrl("https://\\evil.example.com"), null);
  });

  it("rejects non-strings and blanks", () => {
    assert.equal(safeUrl(null), null);
    assert.equal(safeUrl(undefined), null);
    assert.equal(safeUrl(42), null);
    assert.equal(safeUrl(""), null);
    assert.equal(safeUrl("   "), null);
  });
});

describe("jsonForScript", () => {
  it("prevents the </script> breakout", () => {
    const out = jsonForScript({ body: 'nice</script><script>alert(1)</script>' });
    assert.ok(!out.includes("</script>"));
    assert.ok(!out.includes("<"));
    assert.ok(!out.includes(">"));
    // Still valid JSON with the original text intact once parsed.
    assert.equal(
      (JSON.parse(out) as { body: string }).body,
      'nice</script><script>alert(1)</script>',
    );
  });

  it("escapes ampersands, so an HTML-entity-decoding context cannot rebuild a tag", () => {
    const out = jsonForScript({ body: "&lt;/script&gt;" });
    assert.ok(!out.includes("&"));
    assert.equal((JSON.parse(out) as { body: string }).body, "&lt;/script&gt;");
  });

  it("escapes U+2028 and U+2029, which are legal JSON but break JS source", () => {
    const out = jsonForScript({ body: "line\u2028break\u2029here" });
    assert.ok(!out.includes("\u2028"));
    assert.ok(!out.includes("\u2029"));
    assert.equal((JSON.parse(out) as { body: string }).body, "line\u2028break\u2029here");
  });

  it("round-trips a realistic review payload", () => {
    const payload = {
      "@type": "Review",
      author: { name: "Maya R." },
      reviewBody: "Runs small — size up. 5/5 & would buy again <3",
    };
    assert.deepEqual(JSON.parse(jsonForScript(payload)), payload);
  });
});

describe("safeColor", () => {
  it("accepts 3-, 6- and 8-digit hex", () => {
    assert.equal(safeColor("#e09112", "#000"), "#e09112");
    assert.equal(safeColor("#FFF", "#000"), "#FFF");
    assert.equal(safeColor("#e0911280", "#000"), "#e0911280");
    assert.equal(safeColor("  #e09112  ", "#000"), "#e09112");
  });

  it("refuses anything that could close the style element or fetch a URL", () => {
    assert.equal(safeColor("</style><script>alert(1)</script>", "#e09112"), "#e09112");
    assert.equal(safeColor("red;background:url(https://evil.example/x)", "#e09112"), "#e09112");
    assert.equal(safeColor("expression(alert(1))", "#e09112"), "#e09112");
    // Even valid CSS colour keywords are refused: hex only, so the grammar stays tiny.
    assert.equal(safeColor("goldenrod", "#e09112"), "#e09112");
    assert.equal(safeColor(null, "#e09112"), "#e09112");
    assert.equal(safeColor(12, "#e09112"), "#e09112");
  });
});

describe("safePx", () => {
  it("clamps to the allowed range and rounds", () => {
    assert.equal(safePx(12, 12), 12);
    assert.equal(safePx(11.6, 12), 12);
    assert.equal(safePx(-5, 12), 0);
    assert.equal(safePx(9999, 12), 64);
    assert.equal(safePx(30, 12, 0, 20), 20);
  });

  it("falls back on anything non-numeric, including CSS injections", () => {
    assert.equal(safePx("12px;}html{display:none", 12), 12);
    assert.equal(safePx(undefined, 12), 12);
    assert.equal(safePx(Number.NaN, 12), 12);
    assert.equal(safePx(Number.POSITIVE_INFINITY, 12), 12);
  });
});

describe("clamp", () => {
  it("leaves short text alone", () => {
    assert.equal(clamp("Beautiful weight.", 900), "Beautiful weight.");
  });

  it("cuts on a word boundary and marks the elision", () => {
    const out = clamp("the quick brown fox jumps over the lazy dog", 20);
    assert.ok(out.length <= 21);
    assert.ok(out.endsWith("…"));
    assert.ok(!out.includes("jumps"));
  });

  it("still cuts when there is no usable word boundary", () => {
    const out = clamp("a".repeat(50), 10);
    assert.equal(out, `${"a".repeat(10)}…`);
  });
});
