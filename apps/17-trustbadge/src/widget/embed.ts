/**
 * The embed — THE product surface. Vanilla TypeScript, zero dependencies,
 * bundled to `public/widget/w.js` by src/widget/build.ts.
 *
 * Budget (enforced by the build, which fails over it): <= 15KB gzipped.
 * Guarantees, in order of importance:
 *
 *   1. **Never blocks the storefront.** The tag is `async`; everything here runs
 *      after parse and touches nothing outside its own container.
 *   2. **Zero CLS.** The container's height is reserved synchronously, before the
 *      fetch, from the `data-reserve` value the merchant's snippet carries.
 *   3. **Never breaks the host page.** All rendering happens inside a shadow
 *      root, and every failure path leaves the reserved space empty and silent —
 *      a review widget must not be able to take a checkout page down.
 *
 * Untrusted review text is escaped by src/widget/render.ts before it is ever
 * assigned to `innerHTML`; see the note there.
 */

import { renderWidget, reservedHeight, widgetStyles } from "./render";
import type { WidgetPayload } from "./types";

interface Mount {
  el: HTMLElement;
  publicKey: string;
  widgetId: string | null;
  product: string | null;
  api: string;
}

/** Where this script was served from, so the API base needs no configuration. */
function scriptBase(script: HTMLScriptElement | null): string {
  const src = script?.src ?? "";
  try {
    const url = new URL(src, document.baseURI);
    // .../widget/w.js -> ...
    return url.origin + url.pathname.replace(/\/widget\/[^/]*$/, "");
  } catch {
    return "";
  }
}

function reserve(el: HTMLElement, script: HTMLScriptElement, type: string): void {
  const declared = Number(script.getAttribute("data-reserve") ?? "");
  const height =
    Number.isFinite(declared) && declared > 0
      ? declared
      : reservedHeight(type as never, 0, { containerWidth: el.clientWidth });
  // The reservation is layout, not motion: it stays in place after render, so
  // reduced-motion and a cold cache produce the same geometry.
  el.style.minHeight = `${height}px`;
}

function containerFor(script: HTMLScriptElement, widgetId: string | null): HTMLElement {
  const target = script.getAttribute("data-target");
  if (target) {
    const found = document.querySelector<HTMLElement>(target);
    if (found) return found;
  }
  if (widgetId) {
    const byId = document.getElementById(`trustbadge-${widgetId}`);
    if (byId) return byId;
  }
  // No container declared: create one immediately before the script tag, which is
  // where the merchant put it.
  const created = document.createElement("div");
  script.parentNode?.insertBefore(created, script);
  return created;
}

function paint(mount: Mount, payload: WidgetPayload): void {
  const root = mount.el.shadowRoot ?? mount.el.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = widgetStyles(payload.widget);
  const body = document.createElement("div");
  body.innerHTML = renderWidget(payload);

  root.replaceChildren(style, body);

  // Re-reserve from what actually rendered, so a later reflow (fonts, images)
  // cannot shrink the box under the content.
  const measured = body.getBoundingClientRect().height;
  if (measured > 0) mount.el.style.minHeight = `${Math.ceil(measured)}px`;

  wireCarousel(root);
  countImpression(mount, payload);
}

/** Carousel arrows. Buttons, not only a swipe — a gesture is never the only path. */
function wireCarousel(root: ShadowRoot): void {
  const track = root.querySelector<HTMLElement>("[data-tb-track]");
  if (!track) return;
  for (const button of root.querySelectorAll<HTMLElement>("[data-tb-scroll]")) {
    button.addEventListener("click", () => {
      const direction = Number(button.getAttribute("data-tb-scroll")) || 1;
      const card = track.querySelector<HTMLElement>(".tb-card");
      const step = card ? card.getBoundingClientRect().width + 16 : track.clientWidth * 0.8;
      track.scrollBy({ left: step * direction, behavior: "smooth" });
    });
  }
}

/**
 * One impression per widget per page view, reported once the widget is actually
 * on screen. Fire-and-forget: `sendBeacon` cannot delay the storefront, and a
 * failed count is never worth an error in a merchant's console.
 */
function countImpression(mount: Mount, payload: WidgetPayload): void {
  const widgetId = payload.widget.id;
  if (!widgetId) return;

  const send = () => {
    const url = `${mount.api}/api/w/impression`;
    const body = JSON.stringify({ publicKey: mount.publicKey, widgetId });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
        return;
      }
      void fetch(url, { method: "POST", body, keepalive: true, mode: "no-cors" });
    } catch {
      /* counting is never load-bearing */
    }
  };

  if (typeof IntersectionObserver !== "function") {
    send();
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        observer.disconnect();
        send();
      }
    }
  });
  observer.observe(mount.el);
}

/** The JSON-LD block, injected once per page so rich snippets see the reviews. */
function injectJsonLd(payload: WidgetPayload, jsonLd: string | undefined): void {
  if (!jsonLd || payload.aggregate.count === 0) return;
  if (document.querySelector('script[data-trustbadge-ld="1"]')) return;
  const tag = document.createElement("script");
  tag.type = "application/ld+json";
  tag.setAttribute("data-trustbadge-ld", "1");
  // Already escaped for a script context by the server (see render.jsonLdFor).
  tag.textContent = jsonLd;
  document.head.appendChild(tag);
}

async function load(mount: Mount): Promise<void> {
  const params = new URLSearchParams();
  if (mount.widgetId) params.set("widget", mount.widgetId);
  if (mount.product) params.set("product", mount.product);
  const query = params.toString();
  const url = `${mount.api}/api/w/${encodeURIComponent(mount.publicKey)}/reviews${query ? `?${query}` : ""}`;

  const response = await fetch(url, { credentials: "omit", mode: "cors" });
  if (!response.ok) throw new Error(`trustbadge: ${response.status}`);
  const data = (await response.json()) as WidgetPayload & { jsonLd?: string };
  paint(mount, data);
  injectJsonLd(data, data.jsonLd);
}

function boot(): void {
  const scripts = document.querySelectorAll<HTMLScriptElement>(
    "script[data-store]:not([data-tb-done])",
  );

  for (const script of scripts) {
    script.setAttribute("data-tb-done", "1");
    const publicKey = script.getAttribute("data-store");
    if (!publicKey) continue;

    const widgetId = script.getAttribute("data-widget");
    const mount: Mount = {
      el: containerFor(script, widgetId),
      publicKey,
      widgetId,
      product: script.getAttribute("data-product"),
      api: script.getAttribute("data-api") || scriptBase(script),
    };

    reserve(mount.el, script, script.getAttribute("data-type") || "wall");

    load(mount).catch((err) => {
      // Leave the reserved space empty rather than shifting the page, and say why
      // once, quietly. The storefront keeps working.
      if (typeof console !== "undefined") console.warn("[trustbadge]", err);
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
