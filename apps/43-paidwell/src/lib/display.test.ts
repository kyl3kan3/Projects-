import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dsoLabel, plural, shortenPortalLinks, timeAgo } from "@/lib/display";

describe("shortenPortalLinks", () => {
  it("abbreviates a signed portal link but keeps the sentence", () => {
    const body =
      "Pay here: https://paidwell.app/portal/eyJhbGciOiJIUzI1NiJ9.eyJmaXJtSWQiOiJ4In0.abcdefghij — thanks.";
    const out = shortenPortalLinks(body);
    assert.match(out, /https:\/\/paidwell\.app\/portal\/…/);
    assert.match(out, /Pay here:/);
    assert.match(out, /thanks/);
    assert.ok(out.length < body.length);
  });

  it("leaves ordinary links alone", () => {
    const body = "See https://northbank.studio/terms for details.";
    assert.equal(shortenPortalLinks(body), body);
  });
});

describe("dsoLabel", () => {
  it("shows the direction of travel, and says nothing it cannot know", () => {
    assert.equal(dsoLabel(47, -3), "DSO 47d ↓3");
    assert.equal(dsoLabel(47, 4), "DSO 47d ↑4");
    assert.equal(dsoLabel(47, 0), "DSO 47d");
    assert.equal(dsoLabel(null, null), "DSO —");
  });
});

describe("plural and timeAgo", () => {
  it("gets the singular right", () => {
    assert.equal(plural(1, "queued send"), "1 queued send");
    assert.equal(plural(6, "queued send"), "6 queued sends");
  });

  it("describes a sync honestly when it has never run", () => {
    assert.equal(timeAgo(null), "never synced");
    const now = new Date("2026-07-10T12:00:00Z");
    assert.equal(timeAgo(new Date("2026-07-10T11:54:00Z"), now), "synced 6m ago");
    assert.equal(timeAgo(new Date("2026-07-09T12:00:00Z"), now), "synced 1d ago");
  });
});
