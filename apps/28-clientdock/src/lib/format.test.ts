import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  agoStamp,
  clampPct,
  dayLabel,
  fileSize,
  money,
  moneyShort,
  monogram,
  overallProgress,
  slugify,
  stampDate,
  stampDateTime,
  waitingFor,
} from "@/lib/format";
import { stackKeyFor } from "@/lib/files";

describe("money", () => {
  it("formats cents without ever touching a float", () => {
    assert.equal(money(480000), "$4,800.00");
    assert.equal(money(1), "$0.01");
    assert.equal(money(0), "$0.00");
    assert.equal(money(-2550), "-$25.50");
    assert.equal(money(999999999), "$9,999,999.99");
  });

  it("keeps the cents when they matter and drops them when they don't", () => {
    assert.equal(moneyShort(480000), "$4,800");
    assert.equal(moneyShort(480050), "$4,800.50");
  });

  it("labels a non-USD currency rather than pretending it's dollars", () => {
    assert.equal(money(150000, "gbp"), "GBP 1,500.00");
  });
});

describe("stamps", () => {
  const when = new Date("2026-07-03T11:42:00Z");

  it("writes the audit line in DESIGN.md's exact shape", () => {
    assert.equal(stampDate(when), "JUL 3");
    assert.equal(stampDateTime(when), "JUL 3, 11:42 AM");
  });

  it("gets noon and midnight right, where 12-hour clocks usually break", () => {
    assert.equal(stampDateTime(new Date("2026-07-03T12:05:00Z")), "JUL 3, 12:05 PM");
    assert.equal(stampDateTime(new Date("2026-07-03T00:05:00Z")), "JUL 3, 12:05 AM");
    assert.equal(stampDateTime(new Date("2026-07-03T23:59:00Z")), "JUL 3, 11:59 PM");
  });

  it("names the weekday inside a week and the date beyond it", () => {
    const now = new Date("2026-07-03T11:42:00Z"); // a Friday
    assert.equal(dayLabel(new Date("2026-06-30T09:00:00Z"), now), "Tue");
    assert.equal(dayLabel(new Date("2026-06-01T09:00:00Z"), now), "Jun 1");
  });

  it("rounds freshness down, so a portal never looks fresher than it is", () => {
    const now = new Date("2026-07-03T12:00:00Z");
    assert.equal(agoStamp(null, now), "NEVER");
    assert.equal(agoStamp(new Date("2026-07-03T11:59:30Z"), now), "JUST NOW");
    assert.equal(agoStamp(new Date("2026-07-03T11:00:00Z"), now), "1H AGO");
    // 47 hours is one day and 23 hours: still "1D", never "2D".
    assert.equal(agoStamp(new Date("2026-07-01T13:00:00Z"), now), "1D AGO");
    assert.equal(agoStamp(new Date("2026-06-04T12:00:00Z"), now), "29D AGO");
    // 30 days rolls over to months rather than reading "30D AGO".
    assert.equal(agoStamp(new Date("2026-06-03T12:00:00Z"), now), "1MO AGO");
    assert.equal(agoStamp(new Date("2026-05-03T12:00:00Z"), now), "2MO AGO");
  });

  it("describes a wait in the words the attention queue uses", () => {
    const now = new Date("2026-07-03T12:00:00Z");
    assert.equal(waitingFor(new Date("2026-07-03T11:50:00Z"), now), "waiting minutes");
    assert.equal(waitingFor(new Date("2026-07-03T09:00:00Z"), now), "waiting 3 hours");
    assert.equal(waitingFor(new Date("2026-07-02T09:00:00Z"), now), "waiting 1 day");
    assert.equal(waitingFor(new Date("2026-06-30T09:00:00Z"), now), "waiting 3 days");
  });
});

describe("small formatters", () => {
  it("sizes files the way a person reads them", () => {
    assert.equal(fileSize(512), "512 B");
    assert.equal(fileSize(2048), "2 KB");
    assert.equal(fileSize(1024 * 1024 * 2.4), "2.4 MB");
    assert.equal(fileSize(1024 * 1024 * 24), "24 MB");
  });

  it("makes a monogram from one or many words", () => {
    assert.equal(monogram("Meridian Roasters"), "MR");
    assert.equal(monogram("Northbeam"), "N");
    assert.equal(monogram("  Blue   Harbour  Design "), "BD");
    assert.equal(monogram(""), "—");
    assert.equal(monogram("   "), "—");
  });

  it("slugs safely and never returns something too short to route", () => {
    assert.equal(slugify("Meridian Roasters"), "meridian-roasters");
    assert.equal(slugify("  --Ünified Café--  "), "unified-cafe");
    assert.equal(slugify("!!!", "portal"), "portal");
    assert.equal(slugify(""), "portal");
  });

  it("averages phase progress evenly and clamps nonsense", () => {
    assert.equal(overallProgress([]), 0);
    assert.equal(overallProgress([{ progressPct: 100 }, { progressPct: 0 }]), 50);
    assert.equal(overallProgress([{ progressPct: 100 }, { progressPct: 50 }, { progressPct: 0 }]), 50);
    assert.equal(overallProgress([{ progressPct: 400 }, { progressPct: -20 }]), 50);
    assert.equal(clampPct(Number.NaN), 0);
    assert.equal(clampPct(37.6), 38);
  });
});

describe("version stacks", () => {
  it("puts differently-versioned names in the same stack", () => {
    const key = stackKeyFor("Homepage.png");
    assert.equal(stackKeyFor("Homepage v2.png"), key);
    assert.equal(stackKeyFor("homepage-v3.PNG"), key);
    assert.equal(stackKeyFor("Homepage_V10.png"), key);
    assert.equal(stackKeyFor("Homepage version 4.png"), key);
  });

  it("keeps genuinely different deliverables apart", () => {
    assert.notEqual(stackKeyFor("Homepage.png"), stackKeyFor("Pricing page.png"));
    // A different extension is still the same deliverable being revised.
    assert.equal(stackKeyFor("Homepage.png"), stackKeyFor("Homepage.pdf"));
  });

  it("never produces an empty key", () => {
    assert.equal(stackKeyFor("!!!.png"), "deliverable");
    assert.equal(stackKeyFor("v2.png"), "deliverable");
  });
});
