/**
 * Import tests.
 *
 * "Switch in 10 minutes, keep every review" is a marketing claim, so it gets
 * tested against the shapes the competitors' exports actually have — quoted
 * fields with embedded commas and newlines, CRLF endings, a BOM from Excel, star
 * glyphs instead of numbers, unix timestamps, and Judge.me's habit of packing
 * several photo URLs into one cell.
 *
 * The failure that matters is not an exception; it is silently importing 40 of a
 * merchant's 900 reviews and reporting success.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectSource, parseCsv, parseReviewFile, toReviewRow } from "@/lib/import";

describe("parseCsv", () => {
  it("parses a plain file", () => {
    assert.deepEqual(parseCsv("a,b\n1,2"), [
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps commas inside quoted fields", () => {
    assert.deepEqual(parseCsv('rating,body\n5,"Soft, warm, and it washes well"'), [
      ["rating", "body"],
      ["5", "Soft, warm, and it washes well"],
    ]);
  });

  it("keeps newlines inside quoted fields", () => {
    const rows = parseCsv('rating,body\n4,"First line\nSecond line"\n3,short');
    assert.equal(rows.length, 3);
    assert.equal(rows[1][1], "First line\nSecond line");
    assert.equal(rows[2][1], "short");
  });

  it("unescapes doubled quotes", () => {
    assert.deepEqual(parseCsv('body\n"She said ""perfect"" twice"'), [
      ["body"],
      ['She said "perfect" twice'],
    ]);
  });

  it("handles CRLF endings", () => {
    assert.deepEqual(parseCsv("a,b\r\n1,2\r\n"), [
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("strips a UTF-8 BOM, which would otherwise corrupt the first header name", () => {
    const rows = parseCsv("﻿rating,body\n5,good");
    assert.equal(rows[0][0], "rating");
  });

  it("keeps a final row with no trailing newline", () => {
    assert.equal(parseCsv("a\n1\n2").length, 3);
  });

  it("drops blank rows rather than importing them", () => {
    assert.deepEqual(parseCsv("a,b\n1,2\n\n,\n"), [
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("returns nothing for an empty file", () => {
    assert.deepEqual(parseCsv(""), []);
  });
});

describe("detectSource", () => {
  it("recognises a Judge.me export", () => {
    assert.equal(
      detectSource(["title", "body", "rating", "reviewer name", "reviewer email", "product handle", "picture urls"]),
      "import_judgeme",
    );
  });

  it("recognises a Loox export", () => {
    assert.equal(detectSource(["Reviewer", "Rating", "Review", "Photo", "Review Date"]), "import_loox");
  });

  it("falls back to generic CSV for anything else", () => {
    assert.equal(detectSource(["stars", "text", "name"]), "import_csv");
  });
});

describe("parseReviewFile", () => {
  it("imports a Judge.me export, mapping every column it recognises", () => {
    const csv = [
      "title,body,rating,reviewer_name,reviewer_email,product_handle,created_at,verified,picture_urls",
      '"Perfect weight","Beautiful weight, washes well.",5,Maya R.,maya@example.com,harbor-linen-apron,2026-06-24,true,https://cdn.judge.me/a.jpg|https://cdn.judge.me/b.jpg',
    ].join("\n");

    const out = parseReviewFile(csv);
    assert.equal(out.source, "import_judgeme");
    assert.equal(out.errors.length, 0);
    assert.equal(out.rows.length, 1);

    const row = out.rows[0];
    assert.equal(row.rating, 5);
    assert.equal(row.title, "Perfect weight");
    assert.equal(row.body, "Beautiful weight, washes well.");
    assert.equal(row.authorName, "Maya R.");
    assert.equal(row.authorEmail, "maya@example.com");
    assert.equal(row.productExternalId, "harbor-linen-apron");
    assert.equal(row.verifiedPurchase, true);
    // Only the first of the packed photo URLs is taken.
    assert.equal(row.photoUrl, "https://cdn.judge.me/a.jpg");
    assert.equal(row.createdAt?.toISOString().slice(0, 10), "2026-06-24");
  });

  it("imports a Loox export with star glyphs and a unix timestamp", () => {
    const csv = ["Reviewer,Rating,Review,Photo,Review Date", "Tomas L.,★★★★,Runs small — size up.,,1782950400"].join(
      "\n",
    );
    const out = parseReviewFile(csv);
    assert.equal(out.source, "import_loox");
    assert.equal(out.rows.length, 1);
    assert.equal(out.rows[0].rating, 4);
    assert.equal(out.rows[0].authorName, "Tomas L.");
    assert.equal(out.rows[0].createdAt?.getUTCFullYear(), 2026);
    assert.equal(out.rows[0].photoUrl, null);
  });

  it("accepts ratings written as '4 out of 5' and '4/5'", () => {
    const out = parseReviewFile(["rating,body", "4 out of 5,fine", "3/5,ok"].join("\n"));
    assert.deepEqual(
      out.rows.map((r) => r.rating),
      [4, 3],
    );
  });

  it("reports the line number of every row it could not import", () => {
    const csv = [
      "rating,body,name",
      "5,Great,Ann",
      "banana,Broken rating,Bob",
      "4,,Carla", // no text at all
      "9,Out of range,Dee",
      "2,Fine,Eve",
    ].join("\n");

    const out = parseReviewFile(csv);
    assert.equal(out.rows.length, 2);
    assert.deepEqual(
      out.errors.map((e) => e.row),
      [3, 4, 5],
    );
    assert.match(out.errors[0].reason, /not 1–5/);
    assert.match(out.errors[1].reason, /No review text/);
  });

  it("fails loudly when there is no rating column, instead of importing zero rows quietly", () => {
    const out = parseReviewFile("name,comment\nAnn,Lovely");
    assert.equal(out.rows.length, 0);
    assert.equal(out.errors.length, 1);
    assert.match(out.errors[0].reason, /No rating column/);
  });

  it("lists the columns it ignored, so nothing disappears without being named", () => {
    const out = parseReviewFile("rating,body,ip_address,loyalty_points\n5,Good,1.2.3.4,90");
    assert.deepEqual(out.ignoredColumns, ["ip_address", "loyalty_points"]);
  });

  it("never marks an imported review verified unless the export says so", () => {
    const out = parseReviewFile("rating,body,name\n5,Good,Ann");
    assert.equal(out.rows[0].verifiedPurchase, false);
  });

  it("rejects a date in the future rather than scheduling a review from 2031", () => {
    const out = parseReviewFile("rating,body,date\n5,Good,2099-01-01");
    assert.equal(out.rows[0].createdAt, null);
  });

  it("names an author when the export has none", () => {
    const out = parseReviewFile("rating,body\n5,Good");
    assert.equal(out.rows[0].authorName, "Verified buyer");
  });

  it("truncates a hostile 40,000-character body rather than storing it", () => {
    const out = parseReviewFile(`rating,body\n5,${"x".repeat(40_000)}`);
    assert.equal(out.rows[0].body.length, 4_000);
  });
});

describe("toReviewRow", () => {
  const parsed = {
    rating: 5,
    title: "Great",
    body: "Beautiful weight.",
    authorName: "Maya R.",
    authorEmail: "maya@example.com",
    productExternalId: "apron",
    productTitle: "Apron",
    createdAt: new Date("2026-06-24T00:00:00Z"),
    verifiedPurchase: true,
    photoUrl: null,
  };

  it("lands imported reviews in the moderation queue, never straight on the storefront", () => {
    assert.equal(toReviewRow("store-1", "import_judgeme", parsed).status, "pending");
  });

  it("produces the same dedupe hash for the same review, so a re-import is a no-op", () => {
    const a = toReviewRow("store-1", "import_judgeme", parsed);
    const b = toReviewRow("store-1", "import_judgeme", { ...parsed });
    assert.equal(a.dedupeHash, b.dedupeHash);
  });

  it("produces a different hash for a different review", () => {
    const a = toReviewRow("store-1", "import_csv", parsed);
    const b = toReviewRow("store-1", "import_csv", { ...parsed, body: "Something else." });
    assert.notEqual(a.dedupeHash, b.dedupeHash);
  });

  it("ignores case and surrounding whitespace when deduping", () => {
    const a = toReviewRow("store-1", "import_csv", parsed);
    const b = toReviewRow("store-1", "import_csv", {
      ...parsed,
      authorName: "  MAYA R. ",
      body: "Beautiful weight. ",
    });
    assert.equal(a.dedupeHash, b.dedupeHash);
  });

  it("dates the review from the export, not from the import run", () => {
    assert.equal(
      (toReviewRow("store-1", "import_loox", parsed).createdAt as Date).toISOString(),
      "2026-06-24T00:00:00.000Z",
    );
  });
});
