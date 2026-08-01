/**
 * Display formatting.
 *
 * Money and cover are the two strings a merchant reads every day, so they get pinned:
 * a cover of `Infinity`, a `$NaN`, or a shop handle that leaks an internal suffix are
 * all things that make an ops tool look broken even when the maths is right.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ago, count, cover, money, moneyExact, perDay, rate, shopHandle, statusLabel, statusTone } from "@/lib/format";

describe("money", () => {
  it("shows whole dollars, grouped", () => {
    assert.equal(money(641_200), "$6,412");
    assert.equal(money(0), "$0");
    assert.equal(money(-50_000), "-$500");
    // Rounds at the edge, once.
    assert.equal(money(99), "$1");
    assert.equal(money(49), "$0");
  });

  it("falls back to a currency code it has no symbol for", () => {
    assert.equal(money(641_200, "GBP"), "6,412 GBP");
  });
});

describe("moneyExact", () => {
  it("keeps the cents, which are the contract on a PO", () => {
    assert.equal(moneyExact(418_035), "$4,180.35");
    assert.equal(moneyExact(7), "$0.07");
    assert.equal(moneyExact(-1250), "-$12.50");
    assert.equal(moneyExact(100), "$1.00");
  });
});

describe("cover", () => {
  it("never renders Infinity or NaN at a merchant", () => {
    assert.equal(cover(null), "—");
    assert.equal(cover(Number.POSITIVE_INFINITY), "—");
    assert.equal(cover(Number.NaN), "—");
  });

  it("uses one decimal below 100 days and whole days above", () => {
    assert.equal(cover(6.18), "6.2d");
    assert.equal(cover(0.4), "0.4d");
    assert.equal(cover(212.4), "212d");
  });
});

describe("rate and perDay", () => {
  it("keeps one decimal, so a 0.4/day SKU is not rounded to zero", () => {
    assert.equal(rate(0.44), "0.4");
    assert.equal(perDay(6.14), "6.1/day");
    assert.equal(rate(Number.POSITIVE_INFINITY), "—");
  });
});

describe("count", () => {
  it("groups thousands", () => {
    assert.equal(count(1204), "1,204");
    assert.equal(count(0), "0");
  });
});

describe("statusLabel and statusTone", () => {
  it("rations the semantic colours to the meanings DESIGN.md assigns", () => {
    assert.equal(statusLabel("order_now"), "Order now");
    assert.equal(statusTone("order_now"), "rust");
    assert.equal(statusTone("order_soon"), "kraft");
    assert.equal(statusTone("healthy"), "moss");
    // Overstocked and dead are not semantic-coloured: they are not urgent, they are
    // expensive, and the money figure carries that.
    assert.equal(statusTone("overstocked"), "faint");
    assert.equal(statusTone("dead"), "faint");
  });
});

describe("ago", () => {
  const now = new Date("2026-08-01T12:00:00Z");
  it("reads as a sync timestamp", () => {
    assert.equal(ago(null, now), "never");
    assert.equal(ago(new Date("2026-08-01T11:59:40Z"), now), "just now");
    assert.equal(ago(new Date("2026-08-01T11:30:00Z"), now), "30m ago");
    assert.equal(ago(new Date("2026-08-01T04:00:00Z"), now), "8h ago");
    assert.equal(ago(new Date("2026-07-29T12:00:00Z"), now), "3d ago");
  });
});

describe("shopHandle", () => {
  it("strips the myshopify suffix", () => {
    assert.equal(shopHandle("oaklane-goods.myshopify.com"), "oaklane-goods");
  });

  it("hides the demo store's per-merchant discriminator", () => {
    // The domain has to be unique per merchant (a shared one violated the unique
    // index the second time anyone loaded it), but the merchant should not read it.
    assert.equal(shopHandle("oaklane-goods-3f9c21aa.demo.shelfsense.invalid"), "oaklane-goods");
  });

  it("leaves a custom domain alone", () => {
    assert.equal(shopHandle("shop.oaklanegoods.com"), "shop.oaklanegoods.com");
  });
});
