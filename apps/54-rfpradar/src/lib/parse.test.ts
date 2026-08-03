/**
 * The connector parsers. Six portals, six ideas of what a date is — these are the
 * cases that would otherwise be discovered by a firm missing a deadline.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  htmlToText,
  parseCodeList,
  parseCsv,
  parseCsvRecords,
  parseFeedItems,
  parseFlexibleDate,
  parseMoneyCents,
  parseValueBand,
} from "@/lib/parse";

test("CSV: quoted commas, escaped quotes, embedded newlines, CRLF", () => {
  const csv =
    'Solicitation ID,Title,Agency\r\n' +
    'ESBD-1,"Managed Network, Security, and Help Desk","Texas DIR"\r\n' +
    'ESBD-2,"The ""Statewide"" Program","TWC"\r\n' +
    'ESBD-3,"Multi-line\nscope","DPS"\r\n';
  const rows = parseCsv(csv);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[1], ["ESBD-1", "Managed Network, Security, and Help Desk", "Texas DIR"]);
  assert.equal(rows[2][1], 'The "Statewide" Program');
  assert.equal(rows[3][1], "Multi-line\nscope");
});

test("CSV records key off the header row and trim", () => {
  const records = parseCsvRecords(" Solicitation ID , Title \nESBD-9, Cyber assessment \n");
  assert.equal(records.length, 1);
  assert.equal(records[0]["Solicitation ID"], "ESBD-9");
  assert.equal(records[0].Title, "Cyber assessment");
});

test("CSV: a header-only file yields no records, not one blank one", () => {
  assert.deepEqual(parseCsvRecords("A,B,C\n"), []);
  assert.deepEqual(parseCsv(""), []);
});

test("RSS: items, CDATA, and unknown elements kept for the field mapper", () => {
  const xml = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>eVA</title>
<item>
  <title>Enterprise Endpoint Detection and Response Platform</title>
  <link>https://eva.virginia.gov/notice/1</link>
  <guid isPermaLink="false">VA-DGS-26-0412</guid>
  <description><![CDATA[<p>Section 3.2 Scope of services.</p>]]></description>
  <pubDate>Mon, 02 Mar 2026 13:00:00 GMT</pubDate>
  <closeDate>03/19/2026 02:00 PM</closeDate>
  <naics>541512</naics>
</item>
</channel></rss>`;
  const items = parseFeedItems(xml);
  assert.equal(items.length, 1);
  assert.equal(items[0].guid, "VA-DGS-26-0412");
  assert.match(items[0].description, /Section 3\.2/);
  assert.equal(items[0].fields.closeDate, "03/19/2026 02:00 PM");
  assert.equal(items[0].fields.naics, "541512");
});

test("RSS: a single item is not mistaken for a character array", () => {
  const xml = `<rss><channel><item><title>One</title><guid>g1</guid></item></channel></rss>`;
  assert.equal(parseFeedItems(xml).length, 1);
});

test("Atom entries normalize to the same shape", () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
<entry><title>GA cybersecurity assessment</title><id>GPR-56</id>
<summary>Penetration testing services.</summary><updated>2026-02-20T10:00:00Z</updated></entry>
</feed>`;
  const items = parseFeedItems(xml);
  assert.equal(items.length, 1);
  assert.equal(items[0].guid, "GPR-56");
  assert.equal(items[0].pubDate, "2026-02-20T10:00:00Z");
});

test("malformed XML yields no items rather than throwing into the poll", () => {
  assert.deepEqual(parseFeedItems("<rss><channel><item>"), []);
  assert.deepEqual(parseFeedItems("not xml at all"), []);
});

test("HTML becomes readable text, entities and all", () => {
  const html =
    '<div><script>ignore()</script><p>Section&nbsp;3.2 &sect; Scope &amp; services</p><ul><li>One</li><li>Two</li></ul></div>';
  const text = htmlToText(html);
  assert.match(text, /Section 3\.2 § Scope & services/);
  assert.match(text, /One\n+Two/);
  assert.doesNotMatch(text, /ignore/);
});

test("money parses to integer cents, never a float", () => {
  assert.equal(parseMoneyCents("$250,000"), 25_000_000);
  assert.equal(parseMoneyCents("$1.2M"), 120_000_000);
  assert.equal(parseMoneyCents("1.5 million"), 150_000_000);
  assert.equal(parseMoneyCents("$750k"), 75_000_000);
  assert.equal(parseMoneyCents("no figure given"), null);
  assert.ok(Number.isInteger(parseMoneyCents("$1,234.56")));
  assert.equal(parseMoneyCents("$1,234.56"), 123_456);
});

test("value bands read every dash a portal has ever used", () => {
  assert.deepEqual(parseValueBand("$250,000 - $1,000,000"), {
    minCents: 25_000_000,
    maxCents: 100_000_000,
  });
  assert.deepEqual(parseValueBand("$250k–$1M"), { minCents: 25_000_000, maxCents: 100_000_000 });
  assert.deepEqual(parseValueBand("$40k to $90k"), { minCents: 4_000_000, maxCents: 9_000_000 });
  assert.deepEqual(parseValueBand("over $500k"), { minCents: 50_000_000 });
  assert.deepEqual(parseValueBand("up to $50,000"), { maxCents: 5_000_000 });
  assert.deepEqual(parseValueBand("$300,000"), { minCents: 30_000_000, maxCents: 30_000_000 });
  assert.equal(parseValueBand(""), null);
  assert.equal(parseValueBand("TBD"), null);
});

test("dates: ISO, US, RFC 822, and SAM.gov's offset-only form", () => {
  assert.equal(parseFlexibleDate("2026-03-21")?.toISOString(), "2026-03-21T12:00:00.000Z");
  assert.equal(parseFlexibleDate("2026-03-21-05:00")?.toISOString(), "2026-03-21T05:00:00.000Z");
  assert.equal(
    parseFlexibleDate("2026-03-21T17:00:00-05:00")?.toISOString(),
    "2026-03-21T22:00:00.000Z",
  );
  assert.equal(parseFlexibleDate("03/21/2026")?.toISOString(), "2026-03-21T12:00:00.000Z");
  assert.equal(parseFlexibleDate("03/19/2026 02:00 PM")?.toISOString(), "2026-03-19T14:00:00.000Z");
  assert.equal(parseFlexibleDate("3/9/2026 9:30 AM")?.toISOString(), "2026-03-09T09:30:00.000Z");
  assert.equal(parseFlexibleDate("Mon, 02 Mar 2026 13:00:00 GMT")?.toISOString(), "2026-03-02T13:00:00.000Z");
});

test("a date that cannot be read is null, never an Invalid Date", () => {
  // The failure this prevents: `new Date("TBD")` becoming a deadline of NaN,
  // which sorts first, renders as "Invalid Date", and never fires a reminder.
  for (const bad of ["TBD", "", "  ", "see attachment", "13/45/2026", null, undefined]) {
    assert.equal(parseFlexibleDate(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test("midnight US times survive the AM/PM conversion", () => {
  assert.equal(parseFlexibleDate("03/21/2026 12:00 AM")?.toISOString(), "2026-03-21T00:00:00.000Z");
  assert.equal(parseFlexibleDate("03/21/2026 12:00 PM")?.toISOString(), "2026-03-21T12:00:00.000Z");
});

test("code lists split on anything and de-duplicate", () => {
  assert.deepEqual(parseCodeList("541512, 541519"), ["541512", "541519"]);
  assert.deepEqual(parseCodeList("541512;541512"), ["541512"]);
  assert.deepEqual(parseCodeList(["d310", "D310", " "]), ["D310"]);
  assert.deepEqual(parseCodeList("N/A"), []);
  assert.deepEqual(parseCodeList(null), []);
  assert.deepEqual(parseCodeList(undefined), []);
});
