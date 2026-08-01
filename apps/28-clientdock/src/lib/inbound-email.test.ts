import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  InboundEmailError,
  extractAddress,
  parseInboundPayload,
  resolveThreadKey,
  stripQuotedReply,
} from "@/lib/inbound-email";
import { weekKey, daysSince, stalePortals } from "@/lib/tick";
import type { Portal } from "@/db/schema";

describe("inbound email parsing", () => {
  it("pulls a bare address out of a display name", () => {
    assert.equal(extractAddress("Sam Okafor <sam@meridian.coffee>"), "sam@meridian.coffee");
    assert.equal(extractAddress("  SAM@Meridian.Coffee "), "sam@meridian.coffee");
    assert.equal(extractAddress("mailto:sam@meridian.coffee"), "sam@meridian.coffee");
  });

  it("normalises the Resend shape (message nested under data)", () => {
    const email = parseInboundPayload({
      data: {
        to: ["t9fk3ab2c@reply.clientdock.app"],
        from: "Sam Okafor <sam@meridian.coffee>",
        subject: "Re: This week",
        text: "Looks good.",
      },
    });
    assert.deepEqual(email.to, ["t9fk3ab2c@reply.clientdock.app"]);
    assert.equal(email.from, "sam@meridian.coffee");
    assert.equal(email.text, "Looks good.");
  });

  it("normalises the Postmark shape (capitalised, flat, TextBody)", () => {
    const email = parseInboundPayload({
      To: "t9fk3ab2c@reply.clientdock.app, someone@else.com",
      From: "sam@meridian.coffee",
      Subject: "Re: This week",
      TextBody: "Fine by me.",
    });
    assert.deepEqual(email.to, ["t9fk3ab2c@reply.clientdock.app", "someone@else.com"]);
    assert.equal(email.text, "Fine by me.");
  });

  it("normalises objects with an email field, as SendGrid sends", () => {
    const email = parseInboundPayload({
      to: [{ email: "t9fk3ab2c@reply.clientdock.app" }],
      from: { email: "sam@meridian.coffee" },
      text: "Yes",
    });
    assert.deepEqual(email.to, ["t9fk3ab2c@reply.clientdock.app"]);
  });

  it("refuses a payload with no sender or no recipient", () => {
    assert.throws(() => parseInboundPayload({ to: ["x@reply.clientdock.app"] }), InboundEmailError);
    assert.throws(() => parseInboundPayload({ from: "sam@meridian.coffee" }), InboundEmailError);
    assert.throws(() => parseInboundPayload(null), InboundEmailError);
  });
});

describe("thread routing", () => {
  it("finds the reply key among several recipients", () => {
    assert.equal(
      resolveThreadKey(
        ["dana@northbeam.studio", "t9fk3ab2c@reply.clientdock.app"],
        "reply.clientdock.app",
      ),
      "t9fk3ab2c",
    );
  });

  it("ignores recipients on other domains, however similar", () => {
    assert.equal(
      resolveThreadKey(["t9fk3ab2c@reply.clientdock.app.evil.com"], "reply.clientdock.app"),
      null,
    );
    assert.equal(resolveThreadKey(["dana@northbeam.studio"], "reply.clientdock.app"), null);
  });

  it("is case-insensitive about the domain", () => {
    assert.equal(
      resolveThreadKey(["t9fk3ab2c@Reply.ClientDock.App"], "reply.clientdock.app"),
      "t9fk3ab2c",
    );
  });

  it("rejects a local part that isn't a plausible key", () => {
    assert.equal(resolveThreadKey(["a@reply.clientdock.app"], "reply.clientdock.app"), null);
    assert.equal(
      resolveThreadKey(["hello.there@reply.clientdock.app"], "reply.clientdock.app"),
      null,
    );
  });
});

describe("quoted-reply stripping", () => {
  it("cuts the Gmail-style attribution and everything after it", () => {
    const body = stripQuotedReply(
      "Looks good to me.\n\nOn Fri, 3 Jul 2026 at 11:42, Dana Whitlock wrote:\n> the homepage is up",
    );
    assert.equal(body, "Looks good to me.");
  });

  it("cuts the Outlook-style header block", () => {
    assert.equal(
      stripQuotedReply("Approved.\n\nFrom: Dana Whitlock\nSent: Friday\nOriginal text"),
      "Approved.",
    );
  });

  it("cuts a bare quote block", () => {
    assert.equal(stripQuotedReply("Yes please.\n> earlier message"), "Yes please.");
  });

  it("leaves an unquoted reply alone", () => {
    assert.equal(stripQuotedReply("  Yes please.  "), "Yes please.");
  });

  it("returns empty for a reply that is nothing but quoted history", () => {
    assert.equal(stripQuotedReply("> just the quote"), "");
  });
});

describe("the scheduled tick", () => {
  it("buckets by ISO week, so a nudge repeats weekly and never goes silent", () => {
    assert.equal(weekKey(new Date("2026-08-01T00:00:00Z")), "2026-W31");
    // Same week, different day: the same bucket, so no second email.
    assert.equal(weekKey(new Date("2026-07-30T00:00:00Z")), "2026-W31");
    // Next week: a new bucket, so the nudge fires again.
    assert.notEqual(
      weekKey(new Date("2026-08-04T00:00:00Z")),
      weekKey(new Date("2026-07-30T00:00:00Z")),
    );
    // The year boundary must not collapse into week 00 or repeat week 01.
    assert.equal(weekKey(new Date("2026-12-31T00:00:00Z")), "2026-W53");
    assert.equal(weekKey(new Date("2027-01-04T00:00:00Z")), "2027-W01");
  });

  it("counts whole days elapsed", () => {
    const now = new Date("2026-07-08T12:00:00Z");
    assert.equal(daysSince(new Date("2026-07-01T12:00:00Z"), now), 7);
    assert.equal(daysSince(new Date("2026-07-01T13:00:00Z"), now), 6);
  });

  it("nudges only live, non-template portals that have actually gone quiet", () => {
    const now = new Date("2026-07-08T12:00:00Z");
    const base = {
      id: "p",
      workspaceId: "w",
      clientId: "c",
      slug: "s",
      title: "t",
      preparedBy: "",
      welcomeNote: null,
      enabledModules: [],
      status: "active",
      isTemplate: false,
      templateName: null,
      lastUpdatedAt: new Date("2026-07-01T12:00:00Z"),
      lastViewedAt: null,
      createdAt: new Date("2026-06-01T12:00:00Z"),
    } as unknown as Portal;

    const stale = { ...base, id: "stale" };
    const fresh = { ...base, id: "fresh", lastUpdatedAt: new Date("2026-07-07T12:00:00Z") };
    const draft = { ...base, id: "draft", status: "draft" } as Portal;
    const archived = { ...base, id: "archived", status: "archived" } as Portal;
    const template = { ...base, id: "template", isTemplate: true } as Portal;

    assert.deepEqual(
      stalePortals([stale, fresh, draft, archived, template], now).map((p) => p.id),
      ["stale"],
    );
  });
});
