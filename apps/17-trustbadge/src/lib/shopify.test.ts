/**
 * Shopify verification and mapping tests.
 *
 * Three things in the Shopify path can be wrong in a way that no amount of manual
 * clicking reveals:
 *
 *  - the shop-domain check, which is the guard against an SSRF that would hand our
 *    API secret to an attacker's server;
 *  - the two HMAC verifications, which are what stop anyone who finds the webhook
 *    URL from inventing orders in a merchant's account;
 *  - the order mapping, because Shopify names the same field three ways.
 *
 * The HMAC cases are computed here with node:crypto so they assert the algorithm
 * rather than a frozen fixture, and each one has a matching negative case.
 */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import {
  isValidShopDomain,
  mapOrder,
  verifyOAuthHmac,
  verifyWebhookHmac,
  type ShopifyOrderPayload,
} from "@/lib/shopify";

const SECRET = "shpss_test_secret_value";

describe("isValidShopDomain", () => {
  it("accepts a real myshopify domain", () => {
    assert.equal(isValidShopDomain("harbor-goods.myshopify.com"), true);
    assert.equal(isValidShopDomain("store123.myshopify.com"), true);
  });

  it("rejects anything that is not exactly a myshopify subdomain", () => {
    // Each of these, interpolated into the token-exchange URL, sends our API
    // secret somewhere it must never go.
    assert.equal(isValidShopDomain("evil.com"), false);
    assert.equal(isValidShopDomain("evil.com/harbor.myshopify.com"), false);
    assert.equal(isValidShopDomain("harbor.myshopify.com.evil.com"), false);
    assert.equal(isValidShopDomain("harbor.myshopify.com/../../admin"), false);
    assert.equal(isValidShopDomain("harbor.myshopify.com:8080"), false);
    assert.equal(isValidShopDomain("harbor.myshopify.com?x=1"), false);
    assert.equal(isValidShopDomain("harbor@evil.myshopify.com"), false);
    assert.equal(isValidShopDomain("-harbor.myshopify.com"), false);
    assert.equal(isValidShopDomain(".myshopify.com"), false);
    assert.equal(isValidShopDomain("https://harbor.myshopify.com"), false);
    assert.equal(isValidShopDomain(""), false);
    assert.equal(isValidShopDomain(null), false);
    assert.equal(isValidShopDomain(undefined), false);
    assert.equal(isValidShopDomain(123), false);
    assert.equal(isValidShopDomain(`${"a".repeat(200)}.myshopify.com`), false);
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
      shop: "harbor-goods.myshopify.com",
      state: "nonce-xyz",
      timestamp: "1780000000",
    };
    query.hmac = sign(query);
    assert.equal(verifyOAuthHmac(query, SECRET), true);
  });

  it("rejects a tampered shop parameter", () => {
    const query: Record<string, string> = {
      code: "abc123",
      shop: "harbor-goods.myshopify.com",
      timestamp: "1780000000",
    };
    query.hmac = sign(query);
    query.shop = "attacker.myshopify.com";
    assert.equal(verifyOAuthHmac(query, SECRET), false);
  });

  it("rejects an added parameter", () => {
    const query: Record<string, string> = { shop: "a.myshopify.com", timestamp: "1" };
    query.hmac = sign(query);
    query.extra = "1";
    assert.equal(verifyOAuthHmac(query, SECRET), false);
  });

  it("rejects the wrong secret", () => {
    const query: Record<string, string> = { shop: "a.myshopify.com", timestamp: "1" };
    query.hmac = sign(query);
    assert.equal(verifyOAuthHmac(query, "some-other-secret"), false);
  });

  it("rejects a missing or empty hmac rather than treating absence as valid", () => {
    assert.equal(verifyOAuthHmac({ shop: "a.myshopify.com" }, SECRET), false);
    assert.equal(verifyOAuthHmac({ shop: "a.myshopify.com", hmac: "" }, SECRET), false);
  });

  it("ignores the legacy signature parameter, as Shopify specifies", () => {
    const query: Record<string, string> = { shop: "a.myshopify.com", timestamp: "1" };
    query.hmac = sign(query);
    query.signature = "legacy-value";
    assert.equal(verifyOAuthHmac(query, SECRET), true);
  });

  it("accepts an uppercase hex digest", () => {
    const query: Record<string, string> = { shop: "a.myshopify.com", timestamp: "1" };
    query.hmac = sign(query).toUpperCase();
    assert.equal(verifyOAuthHmac(query, SECRET), true);
  });
});

describe("verifyWebhookHmac", () => {
  // Shopify's real payloads are pretty-printed, which is why the raw bytes matter.
  const body = '{\n  "id": 5544332211,\n  "email": "maya@example.com"\n}';
  const digest = createHmac("sha256", SECRET).update(body).digest("base64");

  it("accepts the base64 digest of the raw body", () => {
    assert.equal(verifyWebhookHmac(body, digest, SECRET), true);
  });

  it("verifies over the exact bytes, so a re-serialised body fails", () => {
    // This is the classic way webhook verification ships broken: JSON.parse then
    // JSON.stringify produces different bytes and every signature is rejected.
    const reserialised = JSON.stringify(JSON.parse(body));
    assert.notEqual(reserialised, body);
    assert.equal(verifyWebhookHmac(reserialised, digest, SECRET), false);
  });

  it("rejects a missing header instead of allowing the request", () => {
    assert.equal(verifyWebhookHmac(body, null, SECRET), false);
    assert.equal(verifyWebhookHmac(body, "", SECRET), false);
  });

  it("rejects a modified body", () => {
    assert.equal(verifyWebhookHmac(`${body} `, digest, SECRET), false);
  });

  it("rejects a digest of the wrong length without throwing", () => {
    assert.equal(verifyWebhookHmac(body, "abc", SECRET), false);
    assert.equal(verifyWebhookHmac(body, `${digest}==extra`, SECRET), false);
  });

  it("works on a Buffer body, which is what the route actually has", () => {
    assert.equal(verifyWebhookHmac(Buffer.from(body, "utf8"), digest, SECRET), true);
  });
});

describe("mapOrder", () => {
  const base: ShopifyOrderPayload = {
    id: 5544332211,
    name: "#1042",
    email: "maya@example.com",
    phone: null,
    created_at: "2026-06-10T09:00:00Z",
    customer: { first_name: "Maya", last_name: "Rodrigues", phone: "+15550100" },
    line_items: [
      { product_id: 99001, title: "Harbor Linen Apron", quantity: 1 },
      { variant_id: 99002, name: "Beeswax Wrap Set", quantity: 2 },
    ],
  };

  it("maps a fulfilled order", () => {
    const mapped = mapOrder(
      { ...base, fulfillment_status: "fulfilled", fulfillments: [{ created_at: "2026-06-12T15:00:00Z" }] },
      "orders/fulfilled",
    );
    assert.equal(mapped?.externalId, "5544332211");
    assert.equal(mapped?.orderNumber, "#1042");
    assert.equal(mapped?.customerEmail, "maya@example.com");
    assert.equal(mapped?.customerName, "Maya Rodrigues");
    assert.equal(mapped?.status, "fulfilled");
    assert.equal(mapped?.fulfilledAt?.toISOString(), "2026-06-12T15:00:00.000Z");
    assert.equal(mapped?.lineItems.length, 2);
    assert.equal(mapped?.lineItems[0].externalId, "99001");
    assert.equal(mapped?.lineItems[1].externalId, "99002");
    assert.equal(mapped?.lineItems[1].quantity, 2);
  });

  it("treats orders/fulfilled as fulfilment even with no fulfillments array", () => {
    // Shopify does send this shape, and a strict reading of the payload would
    // leave every request unscheduled forever.
    const mapped = mapOrder({ ...base }, "orders/fulfilled");
    assert.equal(mapped?.status, "fulfilled");
    assert.equal(mapped?.fulfilledAt?.toISOString(), "2026-06-10T09:00:00.000Z");
  });

  it("leaves an unfulfilled order pending with no fulfilment time", () => {
    const mapped = mapOrder({ ...base, fulfillment_status: null }, "orders/create");
    assert.equal(mapped?.status, "pending");
    assert.equal(mapped?.fulfilledAt, null);
  });

  it("falls back to contact_email when email is absent", () => {
    const mapped = mapOrder(
      { ...base, email: undefined, contact_email: "MAYA@Example.COM " },
      "orders/create",
    );
    assert.equal(mapped?.customerEmail, "maya@example.com");
  });

  it("prefers the order phone and falls back to the customer's", () => {
    assert.equal(mapOrder(base, "orders/create")?.customerPhone, "+15550100");
    assert.equal(
      mapOrder({ ...base, phone: "+15550999" }, "orders/create")?.customerPhone,
      "+15550999",
    );
  });

  it("marks a cancelled order cancelled and clears the fulfilment time", () => {
    const mapped = mapOrder(
      { ...base, cancelled_at: "2026-06-11T10:00:00Z", fulfillment_status: "fulfilled" },
      "orders/fulfilled",
    );
    assert.equal(mapped?.status, "cancelled");
    assert.equal(mapped?.fulfilledAt, null);
  });

  it("returns null for a payload with no id, rather than inventing one", () => {
    assert.equal(mapOrder({ email: "x@example.com" }, "orders/create"), null);
    assert.equal(mapOrder({}, "orders/fulfilled"), null);
  });

  it("survives an order with no customer, email, or line items", () => {
    const mapped = mapOrder({ id: 1 }, "orders/create");
    assert.equal(mapped?.customerEmail, "");
    assert.equal(mapped?.customerName, null);
    assert.deepEqual(mapped?.lineItems, []);
  });

  it("clamps a zero or missing quantity to one", () => {
    const mapped = mapOrder(
      { id: 1, line_items: [{ title: "Thing", quantity: 0 }, { title: "Other" }] },
      "orders/create",
    );
    assert.equal(mapped?.lineItems[0].quantity, 1);
    assert.equal(mapped?.lineItems[1].quantity, 1);
  });
});
