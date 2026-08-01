/**
 * Embed-snippet tests.
 *
 * The snippet is the product's contract with a third party's HTML: a merchant
 * pastes it once and never looks at it again. If the reserved height is wrong the
 * zero-CLS claim is false; if the async attribute goes missing the widget starts
 * blocking storefront render; if the store key is wrong nothing appears at all.
 * None of those failures would be visible in our own dashboard.
 */

import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import type { Store, Widget, WidgetSettingsRow } from "@/db/schema";
import { reservedHeight } from "@/widget/render";

// The snippet reads NEXT_PUBLIC_* through the env module's lazy getters.
process.env.NEXT_PUBLIC_APP_URL = "https://app.trustbadge.test";
process.env.NEXT_PUBLIC_WIDGET_CDN_URL = "https://cdn.trustbadge.test/widget";

let embedSnippet: typeof import("@/lib/widgets").embedSnippet;
let defaultTheme: typeof import("@/lib/widgets").defaultTheme;
let defaultLayout: typeof import("@/lib/widgets").defaultLayout;

before(async () => {
  ({ embedSnippet, defaultTheme, defaultLayout } = await import("@/lib/widgets"));
});

const store = { publicKey: "pk_test_key_value" } as Pick<Store, "publicKey">;

function widget(over: Partial<Widget> = {}): Widget {
  return {
    id: "33333333-3333-3333-3333-333333333333",
    storeId: "44444444-4444-4444-4444-444444444444",
    type: "wall",
    name: "Homepage wall",
    abGroup: null,
    createdAt: new Date("2026-07-01T00:00:00Z"),
    ...over,
  };
}

function settings(over: Partial<WidgetSettingsRow> = {}): WidgetSettingsRow {
  return {
    widgetId: "33333333-3333-3333-3333-333333333333",
    theme: defaultTheme(),
    layout: defaultLayout("wall"),
    showBranding: true,
    updatedAt: new Date("2026-07-01T00:00:00Z"),
    ...over,
  };
}

describe("embedSnippet", () => {
  it("is one async script and one pre-sized container", () => {
    const snippet = embedSnippet({ store, widget: widget(), settings: settings(), reviewCount: 12 });
    assert.match(snippet, /<script async src="https:\/\/cdn\.trustbadge\.test\/widget\/w\.js"/);
    assert.match(snippet, /data-store="pk_test_key_value"/);
    assert.match(snippet, /data-widget="33333333-3333-3333-3333-333333333333"/);
    assert.match(snippet, /data-type="wall"/);
    assert.match(snippet, /id="trustbadge-33333333-3333-3333-3333-333333333333"/);
    // Exactly one script element, and it is async.
    assert.equal(snippet.split("<script").length - 1, 1);
  });

  it("reserves the height the payload will actually need", () => {
    const layout = { ...defaultLayout("wall"), maxReviews: 12, showPhotos: true };
    const snippet = embedSnippet({
      store,
      widget: widget(),
      settings: settings({ layout }),
      reviewCount: 12,
    });
    const expected = reservedHeight("wall", 12, { containerWidth: 390, withPhotos: true });
    assert.ok(snippet.includes(`min-height:${expected}px`), snippet);
    assert.ok(snippet.includes(`data-reserve="${expected}"`), snippet);
  });

  it("reserves for what will render, not for every review that exists", () => {
    // 400 published reviews with maxReviews 8 must reserve eight cards, not four hundred.
    const layout = { ...defaultLayout("wall"), maxReviews: 8 };
    const many = embedSnippet({ store, widget: widget(), settings: settings({ layout }), reviewCount: 400 });
    const eight = embedSnippet({ store, widget: widget(), settings: settings({ layout }), reviewCount: 8 });
    assert.equal(
      many.match(/data-reserve="(\d+)"/)?.[1],
      eight.match(/data-reserve="(\d+)"/)?.[1],
    );
  });

  it("shrinks the reservation for a store with fewer reviews than the cap", () => {
    const layout = { ...defaultLayout("wall"), maxReviews: 12 };
    const two = Number(
      embedSnippet({ store, widget: widget(), settings: settings({ layout }), reviewCount: 2 }).match(
        /data-reserve="(\d+)"/,
      )?.[1],
    );
    const twelve = Number(
      embedSnippet({ store, widget: widget(), settings: settings({ layout }), reviewCount: 12 }).match(
        /data-reserve="(\d+)"/,
      )?.[1],
    );
    assert.ok(two < twelve, `${two} should be less than ${twelve}`);
  });

  it("uses an inline span for the star snippet, so it sits in a heading", () => {
    const snippet = embedSnippet({
      store,
      widget: widget({ type: "stars" }),
      settings: settings({ layout: defaultLayout("stars") }),
      reviewCount: 300,
    });
    assert.match(snippet, /<span id="trustbadge-[^"]+" style="display:inline-block;min-height:24px">/);
    assert.ok(!snippet.includes("<div"));
  });

  it("adds data-product for a per-product snippet, escaped", () => {
    const snippet = embedSnippet({
      store,
      widget: widget(),
      settings: settings(),
      reviewCount: 5,
      productExternalId: 'apron" onload="alert(1)',
    });
    assert.ok(snippet.includes('data-product="apron&quot; onload=&quot;alert(1)"'), snippet);
    // The injected quote became an entity, so the value never closed and no
    // second attribute was created. `onload=&quot;` as inert text is fine; an
    // `onload="` with a real quote would not be.
    assert.ok(!/\sonload="/.test(snippet), snippet);
    assert.equal(snippet.split('data-product="').length - 1, 1);
  });

  it("omits data-api when the CDN and the app share a host, and includes it otherwise", () => {
    const crossHost = embedSnippet({ store, widget: widget(), settings: settings(), reviewCount: 1 });
    assert.match(crossHost, /data-api="https:\/\/app\.trustbadge\.test"/);

    process.env.NEXT_PUBLIC_WIDGET_CDN_URL = "https://app.trustbadge.test/widget";
    const sameHost = embedSnippet({ store, widget: widget(), settings: settings(), reviewCount: 1 });
    assert.ok(!sameHost.includes("data-api="), sameHost);
    process.env.NEXT_PUBLIC_WIDGET_CDN_URL = "https://cdn.trustbadge.test/widget";
  });
});
