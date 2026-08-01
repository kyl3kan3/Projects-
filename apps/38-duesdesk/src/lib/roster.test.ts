import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapHeader, parseCsv, parseFlexibleDate, parseRoster } from "@/lib/csv";

describe("parseCsv", () => {
  it("handles quoted fields, doubled quotes, and CRLF", () => {
    const text = '"204 Maple St","Alvarez, Rosa","she said ""fine"""\r\n208 Maple St,Ken,\r\n';
    assert.deepEqual(parseCsv(text), [
      ["204 Maple St", "Alvarez, Rosa", 'she said "fine"'],
      ["208 Maple St", "Ken", ""],
    ]);
  });

  it("drops blank lines and a UTF-8 BOM", () => {
    assert.deepEqual(parseCsv("﻿Unit\n\n204\n"), [["Unit"], ["204"]]);
  });
});

describe("mapHeader", () => {
  it("matches the column names real HOA spreadsheets use", () => {
    const columns = mapHeader([
      "Unit Number",
      "Owner Name",
      "Email Address",
      "Cell",
      "Mailing Address",
      "Closing Date",
    ]);
    assert.deepEqual(columns, {
      unit: 0,
      name: 1,
      email: 2,
      phone: 3,
      mailing: 4,
      joined: 5,
    });
  });

  it("matches a hyphenated header — the co-owner regression", () => {
    // Normalising only the cell turned "Co-Owner" into "co owner", which then
    // failed to match the alias "co-owner". Every imported household silently
    // lost its second owner, who is often the one who reads email.
    const columns = mapHeader(["Unit", "Owner", "Co-Owner", "Co-Owner Email"]);
    assert.equal(columns.secondName, 2);
    assert.equal(columns.secondEmail, 3);
  });

  it("ignores columns it does not recognise", () => {
    const columns = mapHeader(["Unit", "Dog's name", "Gate code"]);
    assert.deepEqual(columns, { unit: 0 });
  });
});

describe("parseFlexibleDate", () => {
  it("accepts ISO and US formats", () => {
    assert.equal(parseFlexibleDate("2026-05-12", "2020-01-01"), "2026-05-12");
    assert.equal(parseFlexibleDate("5/12/2026", "2020-01-01"), "2026-05-12");
    assert.equal(parseFlexibleDate("05/12/26", "2020-01-01"), "2026-05-12");
    assert.equal(parseFlexibleDate("3/2/2021", "2020-01-01"), "2021-03-02");
  });

  it("falls back when the cell is empty", () => {
    assert.equal(parseFlexibleDate("", "2020-01-01"), "2020-01-01");
    assert.equal(parseFlexibleDate("   ", "2020-01-01"), "2020-01-01");
  });

  it("refuses anything it cannot read for certain", () => {
    assert.equal(parseFlexibleDate("last spring", "2020-01-01"), null);
    assert.equal(parseFlexibleDate("13/45/2026", "2020-01-01"), null);
  });
});

describe("parseRoster", () => {
  const header = "Unit,Owner,Email,Phone,Mailing Address,Closing Date,Co-Owner,Co-Owner Email";

  it("imports both owners of a household", () => {
    const { rows, problems } = parseRoster(
      `${header}\n204 Maple St,Rosa Alvarez,rosa@example.com,(614) 555-0142,204 Maple St,2019-06-14,Miguel Alvarez,miguel@example.com`,
    );
    assert.equal(problems.length, 0);
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].people, [
      { name: "Rosa Alvarez", email: "rosa@example.com", phone: "+16145550142", isPrimary: true },
      { name: "Miguel Alvarez", email: "miguel@example.com", phone: null, isPrimary: false },
    ]);
    assert.equal(rows[0].joinedOn, "2019-06-14");
    assert.equal(rows[0].mailingAddress, "204 Maple St");
  });

  it("reports a bad email but still imports the household", () => {
    const { rows, problems } = parseRoster(
      `${header}\n216 Maple St,Harold Beck,not-an-email,6145550199,,2015-01-05,,`,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].people[0].email, null);
    assert.equal(rows[0].people[0].phone, "+16145550199");
    assert.match(problems[0].reason, /not a usable email/);
  });

  it("skips rows with no unit and duplicate units, and says which line", () => {
    const { rows, problems } = parseRoster(
      `${header}\n208 Maple St,Ken,ken@example.com,,,,,\n,Nobody,x@example.com,,,,,\n208 Maple St,Dupe,d@example.com,,,,,`,
    );
    assert.deepEqual(rows.map((r) => r.unitLabel), ["208 Maple St"]);
    assert.deepEqual(problems.map((p) => p.line), [3, 4]);
    assert.match(problems[1].reason, /Duplicate/);
  });

  it("refuses a file with no unit column, rather than guessing one", () => {
    const { rows, problems } = parseRoster("Name,Email\nRosa,rosa@example.com");
    assert.equal(rows.length, 0);
    assert.match(problems[0].reason, /No unit column/);
  });

  it("names a household whose owner cell is blank", () => {
    const { rows } = parseRoster(`${header}\n220 Maple St,,,,,,,`);
    assert.equal(rows[0].people[0].name, "Unit 220 Maple St owner");
  });

  it("never imports SMS consent — that belongs to the member", () => {
    const { rows } = parseRoster(
      `${header},SMS Opt In\n204 Maple St,Rosa,rosa@example.com,6145550142,,,,,yes`,
    );
    // The parser has no notion of consent at all; the importer sets it false.
    assert.equal("smsOptIn" in rows[0].people[0], false);
  });

  it("handles an empty file without throwing", () => {
    const { rows, problems } = parseRoster("");
    assert.equal(rows.length, 0);
    assert.equal(problems.length, 1);
  });
});
