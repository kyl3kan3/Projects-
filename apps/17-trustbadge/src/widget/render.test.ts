/**
 * Renderer tests.
 *
 * escape.test.ts proves the escaping primitives are correct. These prove the
 * renderers actually *use* them — the failure mode that matters is not a broken
 * `escapeHtml`, it is one field somewhere that forgot to call it. So every
 * untrusted field of a review is loaded with a live payload and the output is
 * asserted to contain no executable markup.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { jsonLdFor, renderWidget, reservedHeight, starsHtml, widgetStyles } from "@/widget/render";
import type { WidgetConfig, WidgetPayload, WidgetReview, WidgetType } from "@/widget/types";

const XSS = '<img src=x onerror=alert(1)>"><script>alert(document.cookie)</script>';

function config(over: Partial<WidgetConfig> = {}): WidgetConfig {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    type: "wall",
    starColor: "#e09112",
    radius: 12,
    font: "merchant",
    motion: true,
    maxReviews: 12,
    showPhotos: true,
    showReplies: true,
    showBranding: true,
    ...over,
  };
}

function review(over: Partial<WidgetReview> = {}): WidgetReview {
  return {
    id: "22222222-2222-2222-2222-222222222222",
    rating: 5,
    title: "Exactly what I hoped for",
    body: "Beautiful weight, washes well, and the linen softened after two runs.",
    author: "Maya R.",
    verified: true,
    date: "Jun 24",
    dateIso: "2026-06-24",
    product: "Harbor Linen Apron",
    reply: "Thank you Maya — the flax comes from a mill in Kortrijk.",
    photos: [{ url: "https://media.example.com/apron.jpg", width: 1200, height: 1200 }],
    disclosure: "This reviewer received a discount code for adding a photo.",
    ...over,
  };
}

function payload(over: Partial<WidgetPayload> = {}): WidgetPayload {
  return {
    store: { name: "Harbor Goods", url: "https://harborgoods.example" },
    widget: config(),
    aggregate: { rating: 4.8, count: 312, distribution: [3, 4, 11, 52, 242] },
    reviews: [review()],
    product: null,
    generatedAt: "2026-08-01T09:00:00.000Z",
    ...over,
  };
}

/**
 * The renderers emit a closed set of tags. Because every `<` and `>` in
 * untrusted text is escaped, tag boundaries in the output are trustworthy — so
 * "did attacker input become markup?" reduces to two checks: no tag outside our
 * own vocabulary exists, and no tag carries an attribute we never write.
 *
 * Escaped text that merely *reads* like an attack ("onerror=alert(1)" as prose
 * in a review body) is fine, and is exactly what a shopper quoting HTML would
 * produce — so this deliberately inspects tags, not the whole string.
 */
const OWN_TAGS = new Set([
  "article",
  "a",
  "button",
  "div",
  "img",
  "p",
  "path",
  "span",
  "svg",
]);

/**
 * Real attribute names, with quoted values consumed whole.
 *
 * A looser `/\son[a-z]+=/` check is wrong here and it matters: an escaped review
 * body legitimately puts the *text* `onerror=alert(1)` inside a quoted `alt`
 * value, where it is inert. Scanning attribute names distinguishes the two.
 */
function attributeNames(tag: string): string[] {
  const withoutTagName = tag.slice(1).replace(/^\/?[a-zA-Z][-a-zA-Z0-9]*/, "");
  const names: string[] = [];
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?/g;
  for (const match of withoutTagName.matchAll(pattern)) names.push(match[1].toLowerCase());
  return names;
}

function assertInert(html: string): void {
  for (const match of html.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9:-]*)/g)) {
    const tag = match[1].toLowerCase();
    assert.ok(OWN_TAGS.has(tag), `attacker input produced a <${tag}> element`);
  }
  for (const [tag] of html.matchAll(/<[^>]*>/g)) {
    for (const name of attributeNames(tag)) {
      assert.ok(!/^on[a-z]+$/.test(name), `inline event handler "${name}" in: ${tag.slice(0, 120)}`);
    }
    // A URL scheme can only appear in one of our own attributes; check the values.
    for (const [, value] of tag.matchAll(/(?:src|href)\s*=\s*"([^"]*)"/gi)) {
      assert.ok(!/^\s*javascript:/i.test(value), `javascript: URL in: ${tag.slice(0, 120)}`);
    }
    assert.ok(!/\sstyle\s*=\s*"[^"]*(expression|url\()/i.test(tag), `CSS payload in: ${tag}`);
  }
  // Our own <img> elements are the only ones, and they always look like this.
  for (const [tag] of html.matchAll(/<img[^>]*>/gi)) {
    assert.ok(tag.startsWith('<img class="tb-photo"'), `unexpected img element: ${tag}`);
  }
  // Every quoted attribute value must be free of raw angle brackets: one would
  // mean an escape was skipped somewhere upstream even if the tag still parses.
  for (const [, value] of html.matchAll(/=\s*"([^"]*)"/g)) {
    assert.ok(!value.includes("<") && !value.includes(">"), `raw bracket in attribute: ${value}`);
  }
}

const TYPES: WidgetType[] = ["wall", "carousel", "badge", "stars"];

describe("renderWidget escapes every untrusted field", () => {
  for (const type of TYPES) {
    it(`${type}: a payload where every string is an XSS attempt renders inert`, () => {
      const html = renderWidget(
        payload({
          store: { name: XSS, url: XSS },
          widget: config({ type }),
          reviews: [
            review({
              title: XSS,
              body: XSS,
              author: XSS,
              date: XSS,
              product: XSS,
              reply: XSS,
              disclosure: XSS,
              photos: [{ url: "javascript:alert(1)", width: 100, height: 100 }],
            }),
          ],
        }),
      );
      assertInert(html);
      // And the text is still *there*, just neutralised.
      if (type === "wall" || type === "carousel") {
        assert.ok(html.includes("&lt;script&gt;"), "escaped text missing from output");
      }
    });
  }

  it("escapes an attacker's name inside the photo's alt attribute", () => {
    // The one place untrusted text lands in an attribute rather than a text node.
    const html = renderWidget(
      payload({
        reviews: [
          review({
            author: XSS,
            photos: [{ url: "https://media.example.com/a.jpg", width: 800, height: 800 }],
          }),
        ],
      }),
    );
    assertInert(html);
    const alt = html.match(/<img class="tb-photo"[^>]*alt="([^"]*)"/)?.[1] ?? "";
    assert.ok(alt.includes("&lt;img"), "the alt attribute lost the payload entirely");
    assert.ok(!alt.includes('"'), "an unescaped quote could terminate the attribute");
    assert.ok(!alt.includes("<") && !alt.includes(">"), "raw brackets survived into the attribute");
  });

  it("drops a photo whose URL is not http(s), rather than rendering a broken img", () => {
    const html = renderWidget(
      payload({
        reviews: [review({ photos: [{ url: "javascript:alert(1)", width: 10, height: 10 }] })],
      }),
    );
    assert.ok(!html.includes("<img"), "an unsafe photo URL still produced an img element");
  });

  it("keeps a legitimate photo, with explicit intrinsic dimensions for zero CLS", () => {
    const html = renderWidget(payload());
    assert.match(html, /<img class="tb-photo" src="https:\/\/media\.example\.com\/apron\.jpg"/);
    assert.match(html, /width="1200" height="1200"/);
    assert.match(html, /loading="lazy"/);
  });

  it("honours showPhotos and showReplies", () => {
    const html = renderWidget(payload({ widget: config({ showPhotos: false, showReplies: false }) }));
    assert.ok(!html.includes("<img"));
    assert.ok(!html.includes("tb-reply"));
  });

  it("renders no more reviews than maxReviews", () => {
    const many = Array.from({ length: 30 }, (_, i) => review({ id: `r${i}`, author: `Buyer ${i}` }));
    const html = renderWidget(payload({ reviews: many, widget: config({ maxReviews: 6 }) }));
    assert.equal(html.split("tb-card").length - 1, 6);
  });

  it("shows a real empty state rather than an empty box", () => {
    const html = renderWidget(
      payload({ reviews: [], aggregate: { rating: 0, count: 0, distribution: [0, 0, 0, 0, 0] } }),
    );
    assert.ok(html.includes("No reviews yet"));
    assert.ok(html.includes("Harbor Goods"));
  });

  it("renders the verified mark on verified reviews and omits it otherwise", () => {
    assert.ok(renderWidget(payload()).includes("tb-verified"));
    assert.ok(
      !renderWidget(payload({ reviews: [review({ verified: false })] })).includes("tb-verified"),
    );
  });

  it("drops the branding link when the plan removed it", () => {
    assert.ok(renderWidget(payload()).includes("tb-brand"));
    assert.ok(!renderWidget(payload({ widget: config({ showBranding: false }) })).includes("tb-brand"));
  });

  it("never emits an emoji star", () => {
    const html = renderWidget(payload());
    for (const glyph of ["★", "☆", "⭐", "🌟"]) {
      assert.ok(!html.includes(glyph), `found a star glyph instead of a drawn SVG: ${glyph}`);
    }
    assert.ok(html.includes("<svg class=\"tb-star\""));
  });
});

describe("starsHtml", () => {
  it("clips the fill to the true fraction, so 4.8 stops at 96%", () => {
    assert.ok(starsHtml(4.8).includes("--tb-w:96%"));
    assert.ok(starsHtml(5).includes("--tb-w:100%"));
    assert.ok(starsHtml(3).includes("--tb-w:60%"));
    assert.ok(starsHtml(0).includes("--tb-w:0%"));
  });

  it("clamps nonsense ratings instead of producing a broken width", () => {
    assert.ok(starsHtml(9).includes("--tb-w:100%"));
    assert.ok(starsHtml(-2).includes("--tb-w:0%"));
    assert.ok(starsHtml(Number.NaN).includes("--tb-w:0%"));
  });

  it("labels the row for assistive technology", () => {
    assert.ok(starsHtml(4.8).includes('aria-label="Rated 4.8 out of 5"'));
  });

  it("bounds the star size, so a hostile theme cannot blow up the layout", () => {
    assert.ok(starsHtml(5, 9999).includes("--tb-star:40px"));
    assert.ok(starsHtml(5, -4).includes("--tb-star:8px"));
  });
});

describe("widgetStyles", () => {
  it("refuses a theme colour that would break out of the style element", () => {
    const css = widgetStyles(config({ starColor: "</style><script>alert(1)</script>" }));
    assert.ok(!css.includes("<script"));
    assert.ok(!css.includes("</style>"));
    assert.ok(css.includes("--tb-gold:#e09112"));
  });

  it("bounds the radius token", () => {
    assert.ok(widgetStyles(config({ radius: 9999 })).includes("--tb-r:32px"));
    assert.ok(widgetStyles(config({ radius: -5 })).includes("--tb-r:0px"));
  });

  it("inherits the merchant's font when asked, and never otherwise", () => {
    assert.ok(widgetStyles(config({ font: "merchant" })).includes("font-family:inherit"));
    assert.ok(!widgetStyles(config({ font: "trustbadge" })).includes("font-family:inherit"));
  });

  it("collapses the reveal under prefers-reduced-motion, keeping partial star widths", () => {
    const css = widgetStyles(config());
    assert.ok(css.includes("@media (prefers-reduced-motion:reduce)"));
    assert.ok(css.includes("animation:none!important"));
    // The reservation is layout, not motion, so the clip keeps its true width.
    assert.ok(css.includes(".tb-clip{width:var(--tb-w)}"));
  });

  it("emits no keyframes at all when the merchant disabled motion", () => {
    const css = widgetStyles(config({ motion: false }));
    assert.ok(!css.includes("@keyframes"));
  });
});

describe("reservedHeight", () => {
  it("reserves a single row for the carousel regardless of count", () => {
    assert.equal(reservedHeight("carousel", 3), reservedHeight("carousel", 30));
  });

  it("grows the wall by rows, and the column count follows the container width", () => {
    // 6 cards at phone width are 6 rows; at 900px they are 2 rows of 3.
    const phone = reservedHeight("wall", 6, { containerWidth: 390 });
    const desktop = reservedHeight("wall", 6, { containerWidth: 900 });
    assert.ok(phone > desktop, "a phone must reserve more height than a 3-column desktop");
    // Same row count, same reservation: 4 and 6 cards both make 2 rows of 3.
    assert.equal(desktop, reservedHeight("wall", 4, { containerWidth: 900 }));
    // One more row costs exactly one card plus its gap.
    assert.equal(
      reservedHeight("wall", 7, { containerWidth: 900 }) - desktop,
      reservedHeight("wall", 4, { containerWidth: 900 }) -
        reservedHeight("wall", 3, { containerWidth: 900 }),
    );
  });

  it("reserves more when photos are shown", () => {
    assert.ok(
      reservedHeight("wall", 3, { withPhotos: true }) >
        reservedHeight("wall", 3, { withPhotos: false }),
    );
  });

  it("keeps the star snippet to one line", () => {
    assert.equal(reservedHeight("stars", 100), 24);
  });

  it("still reserves space for an empty widget, so the empty state does not shift", () => {
    for (const type of TYPES) assert.ok(reservedHeight(type, 0) > 0);
  });

  it("tolerates a nonsense count", () => {
    assert.ok(reservedHeight("wall", -5) > 0);
    assert.ok(reservedHeight("wall", 1.7) > 0);
  });
});

describe("jsonLdFor", () => {
  it("is safe to place inside a script element", () => {
    const ld = jsonLdFor(payload({ reviews: [review({ body: "</script><script>alert(1)</script>" })] }));
    assert.ok(!ld.includes("</script>"));
    assert.ok(!ld.includes("<"));
    assert.ok(!ld.includes("&"));
    // Still parses, and preserves the shopper's actual words.
    const parsed = JSON.parse(ld) as { review: { reviewBody: string }[] };
    assert.equal(parsed.review[0].reviewBody, "</script><script>alert(1)</script>");
  });

  it("emits AggregateRating with the real counts", () => {
    const parsed = JSON.parse(jsonLdFor(payload())) as {
      "@type": string;
      aggregateRating: { ratingValue: string; reviewCount: number };
    };
    assert.equal(parsed["@type"], "Organization");
    assert.equal(parsed.aggregateRating.ratingValue, "4.8");
    assert.equal(parsed.aggregateRating.reviewCount, 312);
  });

  it("becomes a Product when the payload is scoped to one", () => {
    const parsed = JSON.parse(
      jsonLdFor(payload({ product: { externalId: "sku-1", title: "Harbor Linen Apron" } })),
    ) as { "@type": string; name: string };
    assert.equal(parsed["@type"], "Product");
    assert.equal(parsed.name, "Harbor Linen Apron");
  });

  it("omits the rating block entirely when there are no reviews", () => {
    const parsed = JSON.parse(
      jsonLdFor(payload({ reviews: [], aggregate: { rating: 0, count: 0, distribution: [0, 0, 0, 0, 0] } })),
    ) as Record<string, unknown>;
    // Google penalises an AggregateRating of zero reviews; better to say nothing.
    assert.ok(!("aggregateRating" in parsed));
    assert.ok(!("review" in parsed));
  });

  it("caps the embedded review list, so a product page does not carry 4,000 reviews", () => {
    const many = Array.from({ length: 40 }, (_, i) => review({ id: `r${i}` }));
    const parsed = JSON.parse(jsonLdFor(payload({ reviews: many }))) as { review: unknown[] };
    assert.equal(parsed.review.length, 10);
  });
});
