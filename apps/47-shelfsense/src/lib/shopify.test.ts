/**
 * Shopify verification and mapping.
 *
 * There is no Shopify credential in this environment, so nothing here can call
 * Shopify — which is exactly why these tests exist. Every digest below is computed
 * with `node:crypto` inside the test, so the assertions check the *algorithm* rather
 * than a frozen fixture that would keep passing if the implementation drifted.
 *
 * Four things in this path can be wrong in a way no amount of manual clicking finds:
 *
 *  - the shop-domain guard, which is what stops an unvalidated `shop` parameter from
 *    becoming an SSRF that posts our API secret to an attacker's server;
 *  - the OAuth and webhook HMACs, which are what stop whoever finds the webhook URL
 *    from inventing inventory levels a merchant then spends money on;
 *  - the App Bridge session token, where accepting `alg: none` hands over the admin;
 *  - the order mapping, because a refund, a test order, and a timezone boundary all
 *    corrupt a velocity permanently if they are read wrong.
 */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import {
  isValidShopDomain,
  mapOrder,
  priceToCents,
  verifyOAuthHmac,
  verifySessionToken,
  verifyWebhookHmac,
  type ShopifyOrderPayload,
} from "@/lib/shopify";

const SECRET = "shpss_test_secret_value";
const API_KEY = "test-api-key";

describe("isValidShopDomain", () => {
  it("accepts a real myshopify domain", () => {
    assert.equal(isValidShopDomain("oaklane-goods.myshopify.com"), true);
    assert.equal(isValidShopDomain("store123.myshopify.com"), true);
  });

  it("rejects anything that is not exactly a myshopify subdomain", () => {
    // Each of these, interpolated into the token-exchange URL, sends our API secret
    // somewhere it must never go.
    for (const bad of [
      "evil.com",
      "evil.com/oaklane.myshopify.com",
      "oaklane.myshopify.com.evil.com",
      "oaklane.myshopify.com/../../admin",
      "oaklane.myshopify.com:8080",
      "oaklane.myshopify.com?x=1",
      "oaklane@evil.myshopify.com",
      "-oaklane.myshopify.com",
      ".myshopify.com",
      "https://oaklane.myshopify.com",
      "",
      `${"a".repeat(200)}.myshopify.com`,
    ]) {
      assert.equal(isValidShopDomain(bad), false, `should reject ${JSON.stringify(bad)}`);
    }
    assert.equal(isValidShopDomain(null), false);
    assert.equal(isValidShopDomain(undefined), false);
    assert.equal(isValidShopDomain(123), false);
  });
});

describe("verifyOAuthHmac", () => {
  /** Sign a query the way Shopify does: hmac removed, remaining keys sorted. */
  function sign(query: Record<string, string>): string {
    const message = Object.keys(query)
      .filter((k) => k !== "hmac" && k !== "signature")
      .sort()
      .map(
        (k) =>
          `${encodeURIComponent(k).replace(/%20/g, "+")}=${encodeURIComponent(query[k]).replace(/%20/g, "+")}`,
      )
      .join("&");
    return createHmac("sha256", SECRET).update(message).digest("hex");
  }

  it("accepts a correctly signed callback", () => {
    const query: Record<string, string> = {
      code: "abc123",
      shop: "oaklane-goods.myshopify.com",
      state: "nonce-xyz",
      timestamp: "1780000000",
    };
    query.hmac = sign(query);
    assert.equal(verifyOAuthHmac(query, SECRET), true);
  });

  it("rejects a tampered shop parameter", () => {
    const query: Record<string, string> = { code: "abc", shop: "oaklane-goods.myshopify.com", timestamp: "1" };
    query.hmac = sign(query);
    query.shop = "attacker.myshopify.com";
    assert.equal(verifyOAuthHmac(query, SECRET), false);
  });

  it("rejects an added parameter, a wrong secret, and a missing hmac", () => {
    const base: Record<string, string> = { shop: "a.myshopify.com", timestamp: "1" };
    const withHmac = { ...base, hmac: sign(base) };
    assert.equal(verifyOAuthHmac({ ...withHmac, extra: "1" }, SECRET), false);
    assert.equal(verifyOAuthHmac(withHmac, "another-secret"), false);
    assert.equal(verifyOAuthHmac(base, SECRET), false);
    assert.equal(verifyOAuthHmac({ ...base, hmac: "" }, SECRET), false);
  });

  it("ignores the legacy signature parameter and accepts an uppercase digest", () => {
    const base: Record<string, string> = { shop: "a.myshopify.com", timestamp: "1" };
    assert.equal(verifyOAuthHmac({ ...base, hmac: sign(base), signature: "legacy" }, SECRET), true);
    assert.equal(verifyOAuthHmac({ ...base, hmac: sign(base).toUpperCase() }, SECRET), true);
  });
});

describe("verifyWebhookHmac", () => {
  // Shopify's real payloads are pretty-printed, which is why the raw bytes matter.
  const body = '{\n  "id": 5544332211,\n  "line_items": []\n}';
  const digest = createHmac("sha256", SECRET).update(body).digest("base64");

  it("accepts the base64 digest of the raw body", () => {
    assert.equal(verifyWebhookHmac(body, digest, SECRET), true);
    assert.equal(verifyWebhookHmac(Buffer.from(body, "utf8"), digest, SECRET), true);
  });

  it("verifies over the exact bytes, so a re-serialised body fails", () => {
    // The classic way this ships broken: JSON.parse then JSON.stringify produces
    // different bytes and every real signature is rejected.
    const reserialised = JSON.stringify(JSON.parse(body));
    assert.notEqual(reserialised, body);
    assert.equal(verifyWebhookHmac(reserialised, digest, SECRET), false);
  });

  it("rejects a missing header rather than allowing the request", () => {
    assert.equal(verifyWebhookHmac(body, null, SECRET), false);
    assert.equal(verifyWebhookHmac(body, "", SECRET), false);
  });

  it("rejects a modified body and a wrong-length digest without throwing", () => {
    assert.equal(verifyWebhookHmac(`${body} `, digest, SECRET), false);
    assert.equal(verifyWebhookHmac(body, "abc", SECRET), false);
    assert.equal(verifyWebhookHmac(body, `${digest}==extra`, SECRET), false);
  });
});

describe("verifySessionToken", () => {
  const NOW = new Date("2026-08-01T12:00:00Z");
  const seconds = Math.floor(NOW.getTime() / 1000);

  function token(
    payload: Record<string, unknown>,
    opts: { alg?: string; secret?: string } = {},
  ): string {
    const header = Buffer.from(JSON.stringify({ alg: opts.alg ?? "HS256", typ: "JWT" })).toString(
      "base64url",
    );
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", opts.secret ?? SECRET)
      .update(`${header}.${body}`)
      .digest("base64url");
    return `${header}.${body}.${signature}`;
  }

  const goodPayload = {
    aud: API_KEY,
    dest: "https://oaklane-goods.myshopify.com",
    sub: "42",
    exp: seconds + 60,
    nbf: seconds - 60,
  };

  it("accepts a well-formed token and extracts the shop", () => {
    const claims = verifySessionToken(token(goodPayload), SECRET, API_KEY, NOW);
    assert.equal(claims?.shopDomain, "oaklane-goods.myshopify.com");
    assert.equal(claims?.sub, "42");
  });

  it("rejects alg: none instead of trusting an unsigned token", () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(JSON.stringify(goodPayload)).toString("base64url");
    assert.equal(verifySessionToken(`${header}.${body}.`, SECRET, API_KEY, NOW), null);
    // Even a *correctly signed* token that claims a different algorithm is refused.
    assert.equal(verifySessionToken(token(goodPayload, { alg: "HS512" }), SECRET, API_KEY, NOW), null);
  });

  it("rejects a token signed with someone else's secret", () => {
    assert.equal(
      verifySessionToken(token(goodPayload, { secret: "other" }), SECRET, API_KEY, NOW),
      null,
    );
  });

  it("rejects the wrong audience — a token minted for another app", () => {
    assert.equal(verifySessionToken(token(goodPayload), SECRET, "different-key", NOW), null);
    assert.equal(
      verifySessionToken(token({ ...goodPayload, aud: "someone-else" }), SECRET, API_KEY, NOW),
      null,
    );
  });

  it("honours exp and nbf", () => {
    assert.equal(
      verifySessionToken(token({ ...goodPayload, exp: seconds - 30 }), SECRET, API_KEY, NOW),
      null,
    );
    assert.equal(
      verifySessionToken(token({ ...goodPayload, nbf: seconds + 300 }), SECRET, API_KEY, NOW),
      null,
    );
    // No exp at all is not "never expires".
    const { exp: _exp, ...noExp } = goodPayload;
    assert.equal(verifySessionToken(token(noExp), SECRET, API_KEY, NOW), null);
  });

  it("rejects a dest that is not a myshopify domain", () => {
    assert.equal(
      verifySessionToken(token({ ...goodPayload, dest: "https://evil.com" }), SECRET, API_KEY, NOW),
      null,
    );
  });

  it("rejects malformed input without throwing", () => {
    for (const bad of ["", "a.b", "a.b.c.d", "not-a-token", "!!!.!!!.!!!"]) {
      assert.equal(verifySessionToken(bad, SECRET, API_KEY, NOW), null);
    }
  });
});

describe("priceToCents", () => {
  it("parses Shopify's decimal strings", () => {
    assert.equal(priceToCents("12.50"), 1250);
    assert.equal(priceToCents("128.00"), 12_800);
    assert.equal(priceToCents(22), 2200);
    assert.equal(priceToCents("0.07"), 7);
    assert.equal(priceToCents("7"), 700);
    assert.equal(priceToCents("-12.50"), -1250);
    // The float path gets this one wrong: 1.005 * 100 is 100.49999999999999, which
    // Math.round takes *down* to 100.
    assert.equal(Math.round(1.005 * 100), 100);
    assert.equal(priceToCents("1.005"), 101);
    assert.equal(priceToCents("1.004"), 100);
  });

  it("is zero for anything unparseable", () => {
    assert.equal(priceToCents(null), 0);
    assert.equal(priceToCents(undefined), 0);
    assert.equal(priceToCents(""), 0);
    assert.equal(priceToCents("free"), 0);
  });
});

describe("mapOrder", () => {
  const base: ShopifyOrderPayload = {
    id: 5544332211,
    name: "#1042",
    created_at: "2026-07-15T18:12:00Z",
    line_items: [
      {
        id: "900001",
        product_id: 880001,
        variant_id: 990001,
        sku: "OAK-MUG-03",
        title: "Enamel camp mug",
        variant_title: "Speckled white",
        quantity: 3,
        price: "22.00",
      },
      {
        id: "900002",
        product_id: 880002,
        variant_id: 990002,
        sku: "OAK-SACH-06",
        title: "Cedar drawer sachets",
        variant_title: "6-pack",
        quantity: 2,
        price: "24.00",
      },
    ],
  };

  it("maps units and revenue per variant, in integer cents", () => {
    const mapped = mapOrder(base, "UTC");
    assert.equal(mapped?.externalId, "5544332211");
    assert.equal(mapped?.date, "2026-07-15");
    assert.equal(mapped?.lines.length, 2);
    assert.equal(mapped?.lines[0].units, 3);
    assert.equal(mapped?.lines[0].revenueCents, 6600);
    assert.equal(mapped?.lines[1].revenueCents, 4800);
    assert.equal(mapped?.lines[0].title, "Enamel camp mug · Speckled white");
  });

  it("buckets the sale into the shop's calendar day, not UTC's", () => {
    // 18:12 UTC is 14:12 the same day in New York, but 03:12 the *next* day in Tokyo.
    // Getting this wrong smears a third of a store's sales into the wrong day and
    // quietly distorts every velocity window.
    assert.equal(mapOrder(base, "America/New_York")?.date, "2026-07-15");
    assert.equal(mapOrder(base, "Asia/Tokyo")?.date, "2026-07-16");

    const lateNight = { ...base, created_at: "2026-07-16T03:30:00Z" };
    assert.equal(mapOrder(lateNight, "UTC")?.date, "2026-07-16");
    assert.equal(mapOrder(lateNight, "America/Los_Angeles")?.date, "2026-07-15");
  });

  it("falls back to UTC for a nonsense timezone rather than dropping the order", () => {
    assert.equal(mapOrder(base, "Mars/Olympus")?.date, "2026-07-15");
  });

  it("subtracts refunded units, because a return was not demand", () => {
    const refunded: ShopifyOrderPayload = {
      ...base,
      refunds: [{ refund_line_items: [{ line_item_id: "900001", quantity: 1 }] }],
    };
    const mapped = mapOrder(refunded, "UTC");
    assert.equal(mapped?.lines[0].units, 2);
    assert.equal(mapped?.lines[0].revenueCents, 4400);
    assert.equal(mapped?.lines[1].units, 2, "the other line is untouched");
  });

  it("drops a line refunded to zero entirely", () => {
    const mapped = mapOrder(
      { ...base, refunds: [{ refund_line_items: [{ line_item_id: "900001", quantity: 3 }] }] },
      "UTC",
    );
    assert.equal(mapped?.lines.length, 1);
    assert.equal(mapped?.lines[0].sku, "OAK-SACH-06");
  });

  it("sums refunds across multiple refund records", () => {
    const mapped = mapOrder(
      {
        ...base,
        refunds: [
          { refund_line_items: [{ line_item_id: "900001", quantity: 1 }] },
          { refund_line_items: [{ line_item_id: "900001", quantity: 1 }] },
        ],
      },
      "UTC",
    );
    assert.equal(mapped?.lines[0].units, 1);
  });

  it("marks a cancelled order and a test order so they never enter the history", () => {
    assert.equal(mapOrder({ ...base, cancelled_at: "2026-07-16T09:00:00Z" }, "UTC")?.cancelled, true);
    assert.equal(mapOrder({ ...base, test: true }, "UTC")?.test, true);
    assert.equal(mapOrder(base, "UTC")?.test, false);
  });

  it("returns null rather than inventing an id or a date", () => {
    assert.equal(mapOrder({ created_at: "2026-07-15T00:00:00Z" }, "UTC"), null);
    assert.equal(mapOrder({ id: 1 }, "UTC"), null);
    assert.equal(mapOrder({ id: 1, created_at: "not a date" }, "UTC"), null);
  });

  it("skips a line with no variant id, since there is no SKU to forecast", () => {
    const mapped = mapOrder(
      { id: 7, created_at: "2026-07-15T12:00:00Z", line_items: [{ title: "Gift note", quantity: 1 }] },
      "UTC",
    );
    assert.deepEqual(mapped?.lines, []);
  });

  it("invents a stable SKU placeholder when Shopify has none", () => {
    const mapped = mapOrder(
      {
        id: 7,
        created_at: "2026-07-15T12:00:00Z",
        line_items: [{ id: "1", variant_id: 990003, title: "Unlabelled", quantity: 1, price: "5.00" }],
      },
      "UTC",
    );
    assert.equal(mapped?.lines[0].sku, "VAR-990003");
  });

  it("drops a 'Default Title' variant suffix instead of showing it to the merchant", () => {
    const mapped = mapOrder(
      {
        id: 8,
        created_at: "2026-07-15T12:00:00Z",
        line_items: [
          {
            id: "1",
            variant_id: 990004,
            sku: "OAK-HOOK-02",
            title: "Brass hook rail",
            variant_title: "Default Title",
            quantity: 1,
            price: "42.00",
          },
        ],
      },
      "UTC",
    );
    assert.equal(mapped?.lines[0].title, "Brass hook rail");
  });
});
