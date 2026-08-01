import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BLOCK_THRESHOLD,
  REVIEW_THRESHOLD,
  canonicalizeEmail,
  clientIpFrom,
  emailDomain,
  fraudSummary,
  hashIp,
  hasPlusTag,
  isDisposableDomain,
  isRoleAddress,
  isSelfReferral,
  isValidEmail,
  resolveAttribution,
  scoreSignup,
} from "@/lib/fraud";

describe("email validation", () => {
  it("accepts ordinary addresses", () => {
    for (const email of [
      "sofia@example.com",
      "s.ok@sub.example.co.uk",
      "dev+list@example.io",
      "SOFIA@EXAMPLE.COM",
    ]) {
      assert.ok(isValidEmail(email), email);
    }
  });

  it("rejects the shapes a form actually receives", () => {
    for (const email of [
      "",
      "sofia",
      "sofia@",
      "@example.com",
      "sofia@example",
      "sofia example@x.com",
      "sofia@@example.com",
      "sofia@exa..mple.com",
      "so,fia@example.com",
      "<sofia@example.com>",
      `${"a".repeat(250)}@example.com`,
    ]) {
      assert.ok(!isValidEmail(email), `should reject ${JSON.stringify(email)}`);
    }
  });
});

describe("canonical email — the duplicate defence", () => {
  it("collapses case", () => {
    assert.equal(canonicalizeEmail("Sofia@Example.COM"), "sofia@example.com");
  });

  it("collapses plus-aliases on every provider", () => {
    assert.equal(canonicalizeEmail("sofia+launch@example.com"), "sofia@example.com");
    assert.equal(canonicalizeEmail("sofia+1+2@fastmail.com"), "sofia@fastmail.com");
  });

  it("collapses gmail dots, but not dots elsewhere", () => {
    assert.equal(canonicalizeEmail("so.fi.a@gmail.com"), "sofia@gmail.com");
    assert.equal(canonicalizeEmail("so.fi.a@googlemail.com"), "sofia@gmail.com");
    // Plenty of mail servers treat these as different people; we must not merge.
    assert.equal(canonicalizeEmail("so.fia@example.com"), "so.fia@example.com");
  });

  it("is idempotent, so it can be reapplied to stored values", () => {
    for (const email of ["A.B+x@Gmail.com", "sofia@example.com", "dev+1@fastmail.com"]) {
      const once = canonicalizeEmail(email);
      assert.equal(canonicalizeEmail(once), once);
    }
  });

  it("treats the four ways of writing one gmail address as one signup", () => {
    const forms = ["sofia@gmail.com", "so.fia@gmail.com", "sofia+launch@gmail.com", "SoFia@GMail.com"];
    const canonical = new Set(forms.map(canonicalizeEmail));
    assert.equal(canonical.size, 1);
  });

  it("reads the domain, following known aliases", () => {
    assert.equal(emailDomain("a@Example.COM"), "example.com");
    assert.equal(emailDomain("a@googlemail.com"), "gmail.com");
  });
});

describe("disposable domains", () => {
  it("blocks known throwaway providers", () => {
    for (const domain of ["mailinator.com", "yopmail.com", "10minutemail.com", "guerrillamail.com"]) {
      assert.ok(isDisposableDomain(domain), domain);
    }
  });

  it("catches a subdomain of a known provider", () => {
    assert.ok(isDisposableDomain("test.mailinator.com"));
  });

  it("leaves real providers alone", () => {
    for (const domain of ["gmail.com", "hey.com", "fastmail.com", "protonmail.com", "example.co.uk"]) {
      assert.ok(!isDisposableDomain(domain), domain);
    }
  });
});

describe("role and alias detection", () => {
  it("spots role addresses, including aliased ones", () => {
    assert.ok(isRoleAddress("support@example.com"));
    assert.ok(isRoleAddress("no-reply@example.com"));
    assert.ok(isRoleAddress("info+launch@example.com"));
    assert.ok(!isRoleAddress("sofia@example.com"));
  });

  it("spots plus tags", () => {
    assert.ok(hasPlusTag("sofia+1@example.com"));
    assert.ok(!hasPlusTag("sofia@example.com"));
  });
});

describe("IP handling", () => {
  it("hashes rather than storing an address, and is stable", () => {
    const a = hashIp("203.0.113.7", "salt");
    const b = hashIp("203.0.113.7", "salt");
    assert.equal(a, b);
    assert.equal(a!.length, 32);
    assert.ok(!a!.includes("203"));
  });

  it("separates addresses and separates salts", () => {
    assert.notEqual(hashIp("203.0.113.7", "salt"), hashIp("203.0.113.8", "salt"));
    assert.notEqual(hashIp("203.0.113.7", "salt-a"), hashIp("203.0.113.7", "salt-b"));
  });

  it("returns null when there is nothing to hash", () => {
    assert.equal(hashIp(null, "salt"), null);
    assert.equal(hashIp("", "salt"), null);
    assert.equal(hashIp("unknown", "salt"), null);
  });

  it("takes the client from the front of a forwarded chain", () => {
    assert.equal(
      clientIpFrom({ forwardedFor: "203.0.113.7, 70.41.3.18, 150.172.238.178" }),
      "203.0.113.7",
    );
    assert.equal(clientIpFrom({ forwardedFor: null, realIp: "203.0.113.9" }), "203.0.113.9");
    assert.equal(clientIpFrom({}), null);
  });
});

describe("self-referral", () => {
  it("catches every way of rewriting your own address", () => {
    assert.ok(isSelfReferral("sofia+alt@gmail.com", "sofia@gmail.com"));
    assert.ok(isSelfReferral("So.Fia@gmail.com", "sofia@gmail.com"));
    assert.ok(!isSelfReferral("marcus@gmail.com", "sofia@gmail.com"));
  });

  it("drops the attribution but keeps the signup", () => {
    const result = resolveAttribution("sofia+2@gmail.com", { id: "ref-1", email: "sofia@gmail.com" }, true);
    assert.equal(result.outcome, "self_referral");
    assert.equal(result.referrerId, null);
  });

  it("credits a genuine referral", () => {
    const result = resolveAttribution("marcus@example.com", { id: "ref-1", email: "sofia@gmail.com" }, true);
    assert.equal(result.outcome, "credited");
    assert.equal(result.referrerId, "ref-1");
  });

  it("distinguishes a bad code from no code at all", () => {
    assert.equal(resolveAttribution("m@example.com", null, true).outcome, "unknown_code");
    assert.equal(resolveAttribution("m@example.com", null, false).outcome, "none");
  });
});

describe("fraud scoring", () => {
  const base = { email: "sofia@example.com", ipHash: "abc", userAgent: "Mozilla/5.0" };

  it("passes an ordinary signup", () => {
    const result = scoreSignup(base);
    assert.equal(result.verdict, "ok");
    assert.equal(result.score, 0);
    assert.deepEqual(result.reasons, []);
    assert.equal(result.creditReferral, true);
  });

  it("blocks a disposable address outright", () => {
    const result = scoreSignup({ ...base, email: "burner@mailinator.com" });
    assert.equal(result.verdict, "blocked");
    assert.ok(result.score >= BLOCK_THRESHOLD);
    assert.ok(result.reasons.some((r) => r.includes("disposable")));
  });

  it("quarantines a signup from the referrer's own network", () => {
    const result = scoreSignup({ ...base, referrer: { ipHash: "abc" } });
    assert.equal(result.verdict, "review");
    assert.ok(result.score >= REVIEW_THRESHOLD);
    assert.equal(result.creditReferral, false, "a quarantined referral must not pay yet");
  });

  it("does not punish a different network", () => {
    const result = scoreSignup({ ...base, referrer: { ipHash: "different" } });
    assert.equal(result.verdict, "ok");
  });

  it("quarantines a burst from one network", () => {
    const result = scoreSignup({ ...base, sameIpRecentCount: 3 });
    assert.equal(result.verdict, "review");
  });

  it("tolerates a household or office sharing one address", () => {
    // Two signups from one IP over time is a couple, not an attack.
    const result = scoreSignup({ ...base, sameIpCount: 2, sameIpRecentCount: 1 });
    assert.equal(result.verdict, "ok");
  });

  it("stacks weak signals into a review rather than ignoring them", () => {
    const result = scoreSignup({
      ...base,
      email: "sofia+1@example.com",
      userAgent: null,
      sameIpCount: 5,
    });
    assert.equal(result.score, 45);
    assert.equal(result.verdict, "review");
    assert.equal(result.reasons.length, 3);
  });

  it("caps the score at 100 so the UI never shows 145/100", () => {
    const result = scoreSignup({
      email: "support+x@mailinator.com",
      ipHash: "abc",
      referrer: { ipHash: "abc" },
      sameIpCount: 9,
      sameIpRecentCount: 9,
      userAgent: null,
    });
    assert.equal(result.score, 100);
  });

  it("summarizes for the review queue row", () => {
    assert.equal(fraudSummary({ score: 0, reasons: [] }), "clean");
    assert.equal(
      fraudSummary({ score: 45, reasons: ["same network as the referrer"] }),
      "45/100 · same network as the referrer",
    );
  });
});
