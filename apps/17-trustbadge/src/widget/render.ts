/**
 * The widget renderers: pure functions from payload to HTML string.
 *
 * Why strings and not DOM calls: these same functions render the live previews
 * in the merchant's widget studio (server-side, into `dangerouslySetInnerHTML`)
 * and the real widget on a storefront (client-side, into a shadow root). One
 * renderer, two consumers, no drift — and because they are pure, every escape
 * they perform is unit-testable in Node with no browser (see render.test.ts).
 *
 * Everything untrusted goes through `escapeHtml`, and every URL through
 * `safeUrl` first. There is no other way text reaches the output.
 */

import { clamp, escapeHtml, jsonForScript, safeColor, safePx, safeUrl } from "./escape";
import type { WidgetConfig, WidgetPayload, WidgetReview, WidgetType } from "./types";

const TRUSTBADGE_URL = "https://trustbadge.io";

/** Body text is clamped to 4 lines visually; this bounds the payload itself. */
const MAX_BODY_CHARS = 900;
const MAX_REPLY_CHARS = 400;

/* ------------------------------------------------------------------ stars --- */

/**
 * The brand glyph. 20x20 viewBox to match the app's icon set; drawn filled for
 * ratings and stroked for the empty track. Never an emoji — DESIGN.md is explicit
 * that a five-star review is five drawn stars.
 */
const STAR_PATH =
  "M10 2.4l2.35 4.76 5.25.77-3.8 3.7.9 5.23L10 14.39l-4.7 2.47.9-5.23-3.8-3.7 5.25-.77z";

function starSvg(filled: boolean): string {
  return filled
    ? `<svg class="tb-star" viewBox="0 0 20 20" aria-hidden="true"><path d="${STAR_PATH}" fill="currentColor"/></svg>`
    : `<svg class="tb-star" viewBox="0 0 20 20" aria-hidden="true"><path d="${STAR_PATH}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/></svg>`;
}

function starRow(filled: boolean): string {
  return `<span class="tb-row">${starSvg(filled).repeat(5)}</span>`;
}

/**
 * A star row for `rating`, with the last star clipped to the true fraction —
 * a 4.8 stops honestly at 80% of the fifth star and holds there.
 */
export function starsHtml(rating: number, size = 16): string {
  const value = Math.min(5, Math.max(0, Number.isFinite(rating) ? rating : 0));
  const pct = Math.round((value / 5) * 10_000) / 100;
  const label = `Rated ${value.toFixed(1)} out of 5`;
  return (
    `<span class="tb-stars" style="--tb-star:${safePx(size, 16, 8, 40)}px;--tb-w:${pct}%" ` +
    `role="img" aria-label="${escapeHtml(label)}">` +
    `<span class="tb-track">${starRow(false)}</span>` +
    `<span class="tb-clip">${starRow(true)}</span>` +
    `</span>`
  );
}

/* ------------------------------------------------------------------- parts --- */

/** The verified-buyer mark. It never animates — verification just *is*. */
function leafCheck(): string {
  return (
    `<span class="tb-verified" title="Verified buyer">` +
    `<svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" ` +
    `stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M10 2.5c2.6 1.6 4.4 4.3 4.4 7.3 0 3.3-2 6-4.4 7.7-2.4-1.7-4.4-4.4-4.4-7.7 0-3 1.8-5.7 4.4-7.3Z"/>` +
    `<path d="M7.6 10.1l1.8 1.8 3.2-3.6"/></svg>` +
    `<span class="tb-verified-text">Verified buyer</span></span>`
  );
}

function photoHtml(review: WidgetReview, radius: number): string {
  const photo = review.photos[0];
  if (!photo) return "";
  const url = safeUrl(photo.url);
  if (!url) return "";
  const w = Math.max(1, Math.round(photo.width) || 1);
  const h = Math.max(1, Math.round(photo.height) || 1);
  return (
    `<img class="tb-photo" src="${escapeHtml(url)}" width="${w}" height="${h}" ` +
    `style="border-radius:${safePx(radius, 12, 0, 32)}px" loading="lazy" decoding="async" ` +
    `alt="Photo in a review by ${escapeHtml(review.author)}"/>`
  );
}

function reviewCard(review: WidgetReview, config: WidgetConfig, index: number): string {
  const photo = config.showPhotos ? photoHtml(review, config.radius) : "";
  const reply =
    config.showReplies && review.reply
      ? `<p class="tb-reply"><span class="tb-reply-who">Store reply</span> ${escapeHtml(clamp(review.reply, MAX_REPLY_CHARS))}</p>`
      : "";
  const title = review.title
    ? `<p class="tb-review-title">${escapeHtml(clamp(review.title, 120))}</p>`
    : "";
  const disclosure = review.disclosure
    ? `<p class="tb-disclosure">${escapeHtml(clamp(review.disclosure, 200))}</p>`
    : "";
  const product = review.product
    ? `<p class="tb-product">${escapeHtml(clamp(review.product, 80))}</p>`
    : "";

  return (
    `<article class="tb-card" style="--tb-i:${Math.min(index, 7)}">` +
    photo +
    `<div class="tb-head">${starsHtml(review.rating)}${review.verified ? leafCheck() : ""}</div>` +
    title +
    `<p class="tb-body">${escapeHtml(clamp(review.body, MAX_BODY_CHARS))}</p>` +
    reply +
    disclosure +
    `<p class="tb-meta">${escapeHtml(review.author)} &middot; ${escapeHtml(review.date)}</p>` +
    product +
    `</article>`
  );
}

function branding(config: WidgetConfig): string {
  if (!config.showBranding) return "";
  return (
    `<a class="tb-brand" href="${TRUSTBADGE_URL}" target="_blank" rel="noopener nofollow">` +
    `Reviews by TrustBadge</a>`
  );
}

/** "4.8 &middot; 312 reviews", always mono and tabular. */
function ratingLine(payload: WidgetPayload, withWord = true): string {
  const { rating, count } = payload.aggregate;
  const n = count.toLocaleString("en-US");
  const noun = count === 1 ? "review" : "reviews";
  return `<span class="tb-data">${rating.toFixed(1)}${withWord ? ` &middot; ${n} ${noun}` : ` &middot; ${n}`}</span>`;
}

function emptyState(payload: WidgetPayload): string {
  return (
    `<div class="tb-empty">` +
    `<p class="tb-empty-title">No reviews yet</p>` +
    `<p class="tb-empty-body">${escapeHtml(payload.store.name)} is collecting them now. ` +
    `Reviews appear here the moment they are published.</p>` +
    `</div>`
  );
}

/* --------------------------------------------------------------- renderers --- */

function renderWall(payload: WidgetPayload): string {
  const { widget } = payload;
  const list = payload.reviews.slice(0, widget.maxReviews);
  if (!list.length) return emptyState(payload);
  return (
    `<div class="tb-summary">${starsHtml(payload.aggregate.rating, 18)}${ratingLine(payload)}</div>` +
    `<div class="tb-wall">${list.map((r, i) => reviewCard(r, widget, i)).join("")}</div>` +
    branding(widget)
  );
}

function renderCarousel(payload: WidgetPayload): string {
  const { widget } = payload;
  const list = payload.reviews.slice(0, widget.maxReviews);
  if (!list.length) return emptyState(payload);
  return (
    `<div class="tb-summary">${starsHtml(payload.aggregate.rating, 18)}${ratingLine(payload)}` +
    `<span class="tb-nav">` +
    `<button type="button" class="tb-arrow" data-tb-scroll="-1" aria-label="Previous reviews">` +
    `<svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" ` +
    `stroke-linecap="round" stroke-linejoin="round"><path d="M12 5l-5 5 5 5"/></svg></button>` +
    `<button type="button" class="tb-arrow" data-tb-scroll="1" aria-label="More reviews">` +
    `<svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" ` +
    `stroke-linecap="round" stroke-linejoin="round"><path d="M8 5l5 5-5 5"/></svg></button>` +
    `</span></div>` +
    `<div class="tb-carousel" data-tb-track tabindex="0" role="group" aria-label="Customer reviews">` +
    list.map((r, i) => reviewCard(r, widget, i)).join("") +
    `</div>` +
    branding(widget)
  );
}

function renderBadge(payload: WidgetPayload): string {
  const { widget, aggregate } = payload;
  if (!aggregate.count) return emptyState(payload);
  return (
    `<div class="tb-badge">` +
    `<span class="tb-badge-score">${aggregate.rating.toFixed(1)}</span>` +
    `<span class="tb-badge-right">` +
    `${starsHtml(aggregate.rating, 14)}` +
    `<span class="tb-badge-count">${aggregate.count.toLocaleString("en-US")} verified ` +
    `${aggregate.count === 1 ? "review" : "reviews"}</span>` +
    `<span class="tb-badge-store">${escapeHtml(payload.store.name)}</span>` +
    `</span></div>` +
    branding(widget)
  );
}

function renderStarSnippet(payload: WidgetPayload): string {
  const { aggregate } = payload;
  if (!aggregate.count) {
    return `<span class="tb-snippet">${starsHtml(0, 16)}<span class="tb-data">No reviews yet</span></span>`;
  }
  return `<span class="tb-snippet">${starsHtml(aggregate.rating, 16)}${ratingLine(payload)}</span>`;
}

/** Render the widget body for whichever type the payload declares. */
export function renderWidget(payload: WidgetPayload): string {
  switch (payload.widget.type) {
    case "wall":
      return renderWall(payload);
    case "carousel":
      return renderCarousel(payload);
    case "badge":
      return renderBadge(payload);
    case "stars":
      return renderStarSnippet(payload);
    default:
      return emptyState(payload);
  }
}

/* -------------------------------------------------------------------- CSS --- */

/**
 * The widget's stylesheet, themed per instance. Lives inside a shadow root, so
 * the host storefront's CSS cannot reach in and ours cannot leak out.
 *
 * Interpolated values are only ever a validated hex colour or a bounded integer
 * — see `safeColor` / `safePx`. A raw theme string here would be a CSS injection.
 */
export function widgetStyles(config: WidgetConfig): string {
  const gold = safeColor(config.starColor, "#e09112");
  const radius = safePx(config.radius, 12, 0, 32);
  const font =
    config.font === "merchant"
      ? "inherit"
      : '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';

  return `
:host{display:block;container-type:inline-size;font-family:${font};color:#221c13;
  --tb-gold:${gold};--tb-line:#eae4d7;--tb-2:#8c8577;--tb-3:#bdb6a6;--tb-r:${radius}px;
  --tb-ease:cubic-bezier(0.25,1,0.5,1)}
*{box-sizing:border-box;margin:0}
.tb-data{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:13px;
  font-variant-numeric:tabular-nums;color:var(--tb-2)}
.tb-summary{display:flex;align-items:center;gap:8px;padding-bottom:16px}
.tb-nav{margin-left:auto;display:flex;gap:8px}
.tb-arrow{width:44px;height:44px;display:inline-flex;align-items:center;justify-content:center;
  border:1px solid var(--tb-line);border-radius:10px;background:#fff;color:#221c13;cursor:pointer;padding:0}
.tb-arrow svg{width:20px;height:20px}
.tb-arrow:focus-visible{outline:2px solid var(--tb-gold);outline-offset:2px}

.tb-stars{position:relative;display:inline-block;line-height:0;height:var(--tb-star);flex:none}
.tb-row{display:flex;gap:4px;width:max-content}
.tb-star{width:var(--tb-star);height:var(--tb-star);display:block}
.tb-track{color:var(--tb-3);display:block}
.tb-clip{position:absolute;top:0;left:0;height:100%;overflow:hidden;width:var(--tb-w);
  color:var(--tb-gold);display:block}

.tb-card{background:#fff;border:1px solid var(--tb-line);border-radius:var(--tb-r);padding:16px;
  box-shadow:0 1px 2px rgba(34,28,19,.06)}
.tb-photo{width:100%;aspect-ratio:1;object-fit:cover;display:block;margin-bottom:12px;background:var(--tb-line)}
.tb-head{display:flex;align-items:center;gap:8px;min-height:20px}
.tb-verified{display:inline-flex;align-items:center;gap:4px;color:#3b9e6b;font-size:11px;
  font-weight:600;letter-spacing:.08em;text-transform:uppercase}
.tb-verified svg{width:16px;height:16px}
.tb-review-title{font-size:15px;font-weight:600;line-height:1.35;margin-top:10px}
.tb-body{font-size:16px;line-height:1.55;margin-top:8px;display:-webkit-box;-webkit-line-clamp:4;
  -webkit-box-orient:vertical;overflow:hidden}
.tb-reply{font-size:13px;line-height:1.45;color:var(--tb-2);margin-top:12px;
  border-left:1px solid var(--tb-line);padding-left:12px}
.tb-reply-who{font-weight:600;color:#221c13}
.tb-disclosure{font-size:13px;line-height:1.45;color:var(--tb-2);margin-top:8px}
.tb-meta{font-size:13px;line-height:1.45;color:var(--tb-2);margin-top:12px}
.tb-product{font-size:13px;line-height:1.45;color:var(--tb-3);margin-top:2px}

.tb-wall{columns:1;column-gap:16px}
.tb-wall .tb-card{break-inside:avoid;margin-bottom:16px}
@container (min-width:520px){.tb-wall{columns:2}}
@container (min-width:860px){.tb-wall{columns:3}}
@container (min-width:1120px){.tb-wall{columns:4}}

.tb-carousel{display:flex;gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;
  scrollbar-width:none;padding-bottom:4px}
.tb-carousel::-webkit-scrollbar{display:none}
.tb-carousel .tb-card{flex:0 0 min(300px,86%);scroll-snap-align:start}
.tb-carousel:focus-visible{outline:2px solid var(--tb-gold);outline-offset:4px}

.tb-badge{display:flex;align-items:center;gap:16px;background:#fff;border:1px solid var(--tb-line);
  border-radius:var(--tb-r);padding:16px;box-shadow:0 1px 2px rgba(34,28,19,.06)}
.tb-badge-score{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:32px;line-height:1;
  font-variant-numeric:tabular-nums;font-weight:500}
.tb-badge-right{display:flex;flex-direction:column;gap:4px;min-width:0}
.tb-badge-count{font-size:13px;color:var(--tb-2)}
.tb-badge-store{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;
  color:var(--tb-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.tb-snippet{display:inline-flex;align-items:center;gap:8px}

.tb-empty{border:1px solid var(--tb-line);border-radius:var(--tb-r);padding:16px;background:#fff}
.tb-empty-title{font-size:15px;font-weight:600}
.tb-empty-body{font-size:13px;line-height:1.45;color:var(--tb-2);margin-top:4px}

.tb-brand{display:inline-block;margin-top:12px;font-size:11px;font-weight:600;letter-spacing:.08em;
  text-transform:uppercase;color:var(--tb-3);text-decoration:none}
.tb-brand:hover{color:var(--tb-2)}

${
  config.motion
    ? `
/* The signature: cards settle in, stars fill left to right, honestly. */
.tb-card{animation:tb-rise 240ms var(--tb-ease) both;animation-delay:calc(var(--tb-i,0) * 30ms)}
@keyframes tb-rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.tb-clip{animation:tb-fill 450ms var(--tb-ease) both}
@keyframes tb-fill{from{width:0}to{width:var(--tb-w)}}
/* The leaf-check is exempt: verification does not perform. */
.tb-verified{animation:none}`
    : ""
}

@media (prefers-reduced-motion:reduce){
  .tb-card,.tb-clip{animation:none!important}
  .tb-card{opacity:1;transform:none}
  .tb-clip{width:var(--tb-w)}
}`.trim();
}

/* --------------------------------------------------------- CLS reservation --- */

/**
 * The height the embed reserves *before* any data arrives. This is the whole
 * zero-CLS story: the snippet a merchant copies carries this number, the script
 * applies it synchronously as `min-height`, and nothing moves when the reviews
 * land. Under-reserving shifts the page; over-reserving leaves a gap. Both are
 * bugs, so this is computed from the same review count the payload will carry.
 *
 * `containerWidth` is what the embed measures on the host page; the server uses
 * the phone width (390) because that is the layout most storefront visitors get.
 */
export function reservedHeight(
  type: WidgetType,
  reviewCount: number,
  opts: { containerWidth?: number; withPhotos?: boolean } = {},
): number {
  const count = Math.max(0, Math.floor(reviewCount));
  const width = opts.containerWidth && opts.containerWidth > 0 ? opts.containerWidth : 390;
  const cardHeight = opts.withPhotos ? 420 : 232;

  switch (type) {
    case "stars":
      return 24;
    case "badge":
      return count ? 84 : 96;
    case "carousel":
      // One row, whatever the width: the track scrolls sideways.
      return count ? 36 + cardHeight + 24 : 96;
    case "wall": {
      if (!count) return 96;
      // Mirror the container queries in widgetStyles().
      const columns = width >= 1120 ? 4 : width >= 860 ? 3 : width >= 520 ? 2 : 1;
      const rows = Math.ceil(count / columns);
      return 36 + rows * (cardHeight + 16) - 16 + 24;
    }
    default:
      return 96;
  }
}

/* ---------------------------------------------------------------- JSON-LD --- */

/**
 * schema.org `AggregateRating` + `Review`, for the merchant's rich snippets.
 *
 * Serialised with `jsonForScript`, never plain `JSON.stringify`: a review body
 * containing `</script>` would otherwise close the block and turn the rest of
 * the JSON into live markup on the merchant's product page.
 */
export function jsonLdFor(payload: WidgetPayload): string {
  const name = payload.product?.title ?? payload.store.name;
  const graph: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": payload.product ? "Product" : "Organization",
    name,
  };

  if (payload.aggregate.count > 0) {
    graph.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: payload.aggregate.rating.toFixed(1),
      reviewCount: payload.aggregate.count,
      bestRating: "5",
      worstRating: "1",
    };
    graph.review = payload.reviews.slice(0, 10).map((r) => ({
      "@type": "Review",
      author: { "@type": "Person", name: r.author },
      datePublished: r.dateIso,
      reviewBody: clamp(r.body, MAX_BODY_CHARS),
      ...(r.title ? { name: r.title } : {}),
      reviewRating: {
        "@type": "Rating",
        ratingValue: String(r.rating),
        bestRating: "5",
        worstRating: "1",
      },
    }));
  }

  return jsonForScript(graph);
}
