import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PLANS,
  cheapestPlanWith,
  featureAllowed,
  isUnlimited,
  limitLabel,
  listCapacity,
  plan,
  planForPrice,
  signupCapacity,
} from "@/lib/plans";
import { csvField, csvRow, exportFilename, toCsv } from "@/lib/csv";
import { renderBody, segmentLabel } from "@/lib/blasts";
import { backoffMs, MAX_ATTEMPTS } from "@/lib/webhooks";
import {
  isBannedHue,
  hueOf,
  isDarkGround,
  sanitizeTheme,
  ACCENT_CHOICES,
  GROUND_CHOICES,
} from "@/lib/templates";
import { maskEmail, rankLabel, relativeTime, slugify, truncateMiddle, isReservedSlug } from "@/lib/format";
import { makeSignedToken, readSignedToken, unsubscribeToken, readUnsubscribeToken } from "@/lib/tokens";
import { renderHtml, withUnsubscribeFooter } from "@/lib/email";

describe("plan catalog", () => {
  it("matches the pricing table in README.md", () => {
    assert.equal(PLANS.free.signupsPerList, 250);
    assert.equal(PLANS.free.lists, 1);
    assert.equal(PLANS.growth.priceMonthly, 19);
    assert.equal(PLANS.growth.signupsPerList, 5_000);
    assert.equal(PLANS.pro.priceMonthly, 49);
    assert.ok(isUnlimited(PLANS.pro.signupsPerList));
  });

  it("keeps the badge on free — it is the acquisition engine", () => {
    assert.equal(PLANS.free.canHideBadge, false);
    assert.equal(PLANS.growth.canHideBadge, true);
  });

  it("gates features exactly as the tiers promise", () => {
    assert.equal(featureAllowed("free", "emailBlasts"), false);
    assert.equal(featureAllowed("growth", "emailBlasts"), true);
    assert.equal(featureAllowed("growth", "webhooks"), false);
    assert.equal(featureAllowed("pro", "webhooks"), true);
    // CSV export is free on purpose: your list is yours.
    assert.equal(featureAllowed("free", "csvExport"), true);
  });

  it("names the cheapest plan that includes a feature", () => {
    assert.equal(cheapestPlanWith("emailBlasts")!.id, "growth");
    assert.equal(cheapestPlanWith("webhooks")!.id, "pro");
    assert.equal(cheapestPlanWith("csvExport")!.id, "free");
  });

  it("defaults an unknown plan id to free, as a webhook might send", () => {
    // @ts-expect-error deliberately passing a bad id
    assert.equal(plan("enterprise").id, "free");
  });

  it("labels limits for humans", () => {
    assert.equal(limitLabel(5_000), "5,000");
    assert.equal(limitLabel(PLANS.pro.lists), "Unlimited");
  });
});

describe("capacity checks", () => {
  it("allows signups up to the cap and refuses past it", () => {
    assert.equal(signupCapacity("free", 249).allowed, true);
    assert.equal(signupCapacity("free", 249).remaining, 1);
    assert.equal(signupCapacity("free", 250).allowed, false);
    assert.ok(signupCapacity("free", 250).reason!.includes("250"));
    assert.equal(signupCapacity("pro", 900_000).allowed, true);
  });

  it("allows one list on free and refuses a second", () => {
    assert.equal(listCapacity("free", 0).allowed, true);
    assert.equal(listCapacity("free", 1).allowed, false);
    assert.equal(listCapacity("growth", 4).allowed, true);
    assert.equal(listCapacity("growth", 5).allowed, false);
  });

  it("never reports negative remaining capacity after a downgrade", () => {
    const check = signupCapacity("free", 4_000);
    assert.equal(check.allowed, false);
    assert.equal(check.remaining, 0);
  });
});

describe("planForPrice", () => {
  const prices = { growth: "price_growth", pro: "price_pro" };
  it("maps a price id to its plan", () => {
    assert.equal(planForPrice("price_growth", prices), "growth");
    assert.equal(planForPrice("price_pro", prices), "pro");
  });
  it("falls back to free for anything unrecognised", () => {
    assert.equal(planForPrice(null, prices), "free");
    assert.equal(planForPrice("price_mystery", prices), "free");
    assert.equal(planForPrice("price_growth", { growth: "", pro: "" }), "free");
  });
});

describe("CSV export", () => {
  it("quotes fields containing commas, quotes and newlines", () => {
    assert.equal(csvField("plain"), "plain");
    assert.equal(csvField("a,b"), '"a,b"');
    assert.equal(csvField('say "hi"'), '"say ""hi"""');
    assert.equal(csvField("line1\nline2"), '"line1\nline2"');
  });

  it("neutralizes spreadsheet formula injection", () => {
    // Prefixed with a quote, then RFC-quoted because it contains double quotes.
    assert.equal(csvField('=HYPERLINK("http://evil")'), `"'=HYPERLINK(""http://evil"")"`);
    assert.equal(csvField("+1234"), "'+1234");
    assert.equal(csvField("-cmd"), "'-cmd");
    assert.equal(csvField("@SUM(A1)"), "'@SUM(A1)");
  });

  it("renders empty for null and undefined rather than the string 'null'", () => {
    assert.equal(csvField(null), "");
    assert.equal(csvField(undefined), "");
  });

  it("builds a CRLF document with a header", () => {
    const doc = toCsv(["email", "position"], [["a@b.com", 1], ["c@d.com", 2]]);
    assert.equal(doc, "email,position\r\na@b.com,1\r\nc@d.com,2\r\n");
  });

  it("names the file after the list and the day", () => {
    assert.equal(
      exportFilename("ledgerly", new Date("2026-08-01T10:00:00Z")),
      "launchlist-ledgerly-2026-08-01.csv",
    );
  });

  it("joins a row", () => {
    assert.equal(csvRow(["a", 1, null]), "a,1,");
  });
});

describe("blast composition", () => {
  const vars = {
    position: 347,
    total: 2847,
    referrals: 2,
    shareUrl: "https://x.dev/l/ledgerly?ref=K7M2PTQ",
    pageUrl: "https://x.dev/l/ledgerly",
  };

  it("substitutes every merge field", () => {
    assert.equal(
      renderBody("You're {{position}} of {{total}} with {{referrals}} referrals: {{share_url}}", vars),
      "You're #347 of 2,847 with 2 referrals: https://x.dev/l/ledgerly?ref=K7M2PTQ",
    );
  });

  it("tolerates whitespace inside the braces", () => {
    assert.equal(renderBody("{{ position }}", vars), "#347");
  });

  it("leaves an unknown token visible instead of silently blanking it", () => {
    assert.equal(renderBody("Hello {{first_name}}", vars), "Hello {{first_name}}");
  });

  it("labels segments", () => {
    assert.equal(segmentLabel({ segment: "all", value: 0 }), "Everyone on the list");
    assert.equal(segmentLabel({ segment: "top_referrers", value: 50 }), "Top 50 referrers");
    assert.equal(segmentLabel({ segment: "reward_tier", value: 3 }), "3+ referrals");
  });
});

describe("webhook retries", () => {
  it("backs off geometrically and caps at two hours", () => {
    assert.equal(backoffMs(1), 60_000);
    assert.equal(backoffMs(2), 300_000);
    assert.equal(backoffMs(3), 1_500_000);
    assert.equal(backoffMs(4), 7_200_000);
    assert.equal(backoffMs(MAX_ATTEMPTS), 7_200_000);
  });
});

describe("theme sanitizing", () => {
  it("computes hue", () => {
    assert.equal(Math.round(hueOf("#FF0000")!), 0);
    assert.equal(Math.round(hueOf("#00FF00")!), 120);
    assert.equal(Math.round(hueOf("#0000FF")!), 240);
    assert.equal(hueOf("nonsense"), null);
  });

  it("bans the purple band, as the design language requires", () => {
    assert.ok(isBannedHue("#8B5CF6"), "the Tailwind violet must be refused");
    assert.ok(isBannedHue("#A855F7"));
    assert.ok(!isBannedHue("#E8654F"));
    assert.ok(!isBannedHue("#4BD8BE"));
    assert.ok(!isBannedHue("#5E8BD6"));
  });

  it("no shipped accent or ground is in the banned band", () => {
    for (const choice of [...ACCENT_CHOICES, ...GROUND_CHOICES]) {
      assert.ok(!isBannedHue(choice.value), `${choice.label} ${choice.value}`);
    }
  });

  it("falls back to the default rather than trusting input", () => {
    assert.deepEqual(sanitizeTheme(null), { ground: "#0A0E1F", accent: "#E8654F", typePair: "grotesk" });
    assert.equal(sanitizeTheme({ accent: "javascript:alert(1)" } as never).accent, "#E8654F");
    assert.equal(sanitizeTheme({ accent: "#8B5CF6" }).accent, "#E8654F");
    assert.equal(sanitizeTheme({ accent: "#d9a227" }).accent, "#D9A227");
    assert.equal(sanitizeTheme({ typePair: "comic" } as never).typePair, "grotesk");
  });

  it("knows a dark ground from a light one", () => {
    assert.ok(isDarkGround("#0A0E1F"));
    assert.ok(!isDarkGround("#F2F4FC"));
  });
});

describe("formatting", () => {
  it("masks an email for the public join feed", () => {
    assert.equal(maskEmail("sofia@gmail.com"), "s***@gmail.com");
    assert.equal(maskEmail("a@b.com"), "a***@b.com");
    assert.equal(maskEmail("broken"), "***");
  });

  it("reads relative time in short form", () => {
    const now = new Date("2026-08-01T12:00:00Z");
    const ago = (ms: number) => relativeTime(new Date(now.getTime() - ms), now);
    assert.equal(ago(5_000), "just now");
    assert.equal(ago(120_000), "2m ago");
    assert.equal(ago(4 * 3_600_000), "4h ago");
    assert.equal(ago(3 * 86_400_000), "3d ago");
    assert.equal(ago(60 * 86_400_000), "2mo ago");
    assert.equal(ago(400 * 86_400_000), "1y ago");
  });

  it("pads leaderboard ranks to two digits", () => {
    assert.equal(rankLabel(4), "04");
    assert.equal(rankLabel(12), "12");
  });

  it("truncates a share URL in the middle", () => {
    const long = "https://launchlist.app/l/ledgerly-bookkeeping?ref=K7M2PTQ";
    const short = truncateMiddle(long, 20);
    assert.ok(short.length <= 20);
    assert.ok(short.startsWith("https"));
    assert.ok(short.endsWith("2PTQ"));
    assert.equal(truncateMiddle("short", 20), "short");
  });

  it("slugifies product names, and never yields an empty slug", () => {
    assert.equal(slugify("Ledgerly"), "ledgerly");
    assert.equal(slugify("Ledgerly — Bookkeeping!"), "ledgerly-bookkeeping");
    assert.equal(slugify("  "), "launch");
    assert.equal(slugify("!!!"), "launch");
    assert.ok(!slugify("a".repeat(80)).endsWith("-"));
  });

  it("refuses slugs that would shadow an app route", () => {
    assert.ok(isReservedSlug("settings"));
    assert.ok(isReservedSlug("api"));
    assert.ok(!isReservedSlug("ledgerly"));
  });
});

describe("capability tokens", () => {
  it("round-trips a signed token", () => {
    const token = makeSignedToken("signup-1", "secret", "unsubscribe");
    assert.equal(readSignedToken(token, "secret", "unsubscribe"), "signup-1");
  });

  it("refuses a tampered id, a wrong secret, and a wrong purpose", () => {
    const token = makeSignedToken("signup-1", "secret", "unsubscribe");
    assert.equal(readSignedToken(token.replace("signup-1", "signup-2"), "secret", "unsubscribe"), null);
    assert.equal(readSignedToken(token, "other-secret", "unsubscribe"), null);
    assert.equal(readSignedToken(token, "secret", "verify"), null);
  });

  it("refuses malformed input without throwing", () => {
    assert.equal(readSignedToken(null, "secret", "unsubscribe"), null);
    assert.equal(readSignedToken("", "secret", "unsubscribe"), null);
    assert.equal(readSignedToken("nodot", "secret", "unsubscribe"), null);
    assert.equal(readSignedToken(".", "secret", "unsubscribe"), null);
  });

  it("wraps the unsubscribe purpose", () => {
    const token = unsubscribeToken("signup-9", "secret");
    assert.equal(readUnsubscribeToken(token, "secret"), "signup-9");
  });
});

describe("email rendering", () => {
  it("escapes HTML in the body", () => {
    const html = renderHtml("<script>alert(1)</script>");
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("&lt;script&gt;"));
  });

  it("links bare URLs", () => {
    const html = renderHtml("Confirm: https://launchlist.app/verify/abc");
    assert.ok(html.includes('href="https://launchlist.app/verify/abc"'));
  });

  it("adds an unsubscribe footer only when asked", () => {
    assert.ok(renderHtml("hi", { unsubscribeUrl: "https://x/u/1" }).includes("Unsubscribe"));
    assert.ok(!renderHtml("hi").includes("Unsubscribe"));
  });

  it("keeps paragraphs as paragraphs", () => {
    const html = renderHtml("one\n\ntwo");
    assert.equal(html.match(/<p /g)?.length, 2);
  });

  it("puts the unsubscribe link in the text part too, not only the HTML", () => {
    const text = withUnsubscribeFooter("Launch day.", "https://x/u/abc");
    assert.ok(text.includes("Unsubscribe: https://x/u/abc"));
    assert.ok(text.startsWith("Launch day."));
  });

  it("leaves transactional mail alone", () => {
    assert.equal(withUnsubscribeFooter("Confirm your spot."), "Confirm your spot.");
  });
});
