/**
 * The student import. This is the funnel's cliff (README risk 1): an owner
 * arrives with a spreadsheet from Kicksite, Zen Planner or a decade of Excel, and
 * what happens in the next ninety seconds decides whether they ever come back.
 *
 * The rule under test throughout: never guess silently. A row that cannot be
 * understood is reported with its line number.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { csvEscape, parseDateish, parseStudentCsv, toCsv } from "@/lib/csv";
import { matchRank } from "@/lib/roster";

describe("parseStudentCsv — headers in the wild", () => {
  it("reads the tidy case", () => {
    const parsed = parseStudentCsv(
      [
        "First name,Last name,Family,Email,Rank,Stripes,Last promoted",
        "Marcus,Okafor,Okafor,dayo.okafor@example.com,Blue belt,2,2025-11-08",
      ].join("\n"),
    );
    assert.deepEqual(parsed.problems, []);
    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.rows[0].firstName, "Marcus");
    assert.equal(parsed.rows[0].lastName, "Okafor");
    assert.equal(parsed.rows[0].guardianEmail, "dayo.okafor@example.com");
    assert.equal(parsed.rows[0].rank, "Blue belt");
    assert.equal(parsed.rows[0].stripes, 2);
    assert.equal(parsed.rows[0].promotedOn, "2025-11-08");
  });

  it("survives an incumbent's column names and casing", () => {
    const parsed = parseStudentCsv(
      [
        "Member Name,Account Name,Primary Email,Current Rank,Last Promotion,Member Since",
        '"Reyes, Sofia",Reyes,c.reyes@example.com,White Belt,12/20/2025,6/11/2024',
      ].join("\n"),
    );
    assert.deepEqual(parsed.problems, []);
    assert.equal(parsed.rows[0].firstName, "Sofia");
    assert.equal(parsed.rows[0].lastName, "Reyes");
    assert.equal(parsed.rows[0].promotedOn, "2025-12-20");
    assert.equal(parsed.rows[0].joinedOn, "2024-06-11");
  });

  it("splits a single Name column, both ways round", () => {
    const parsed = parseStudentCsv(
      ["Name", "Tomas Lindqvist", '"Raman, Priya"', "Mary Jane Watson"].join("\n"),
    );
    assert.equal(parsed.rows[0].firstName, "Tomas");
    assert.equal(parsed.rows[0].lastName, "Lindqvist");
    assert.equal(parsed.rows[1].firstName, "Priya");
    assert.equal(parsed.rows[1].lastName, "Raman");
    assert.equal(parsed.rows[2].firstName, "Mary");
    assert.equal(parsed.rows[2].lastName, "Jane Watson");
  });

  it("defaults the household to the surname, so siblings collapse into one", () => {
    const parsed = parseStudentCsv(
      ["Name,Rank", "Marcus Okafor,Blue belt", "Amara Okafor,White belt"].join("\n"),
    );
    assert.equal(parsed.rows[0].familyName, "Okafor family");
    assert.equal(parsed.rows[1].familyName, "Okafor family");
  });

  it("refuses a file with no name column, and says why", () => {
    const parsed = parseStudentCsv("Rank,Stripes\nBlue belt,2");
    assert.equal(parsed.rows.length, 0);
    assert.match(parsed.problems[0].message, /No name column/);
  });

  it("reports an unreadable date rather than inventing one", () => {
    const parsed = parseStudentCsv(
      ["Name,Last promoted", "Marcus Okafor,sometime last spring"].join("\n"),
    );
    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.rows[0].promotedOn, null);
    assert.equal(parsed.problems.length, 1);
    assert.equal(parsed.problems[0].line, 2);
    assert.match(parsed.problems[0].message, /could not read the promotion date/);
  });

  it("skips a nameless row with its line number", () => {
    const parsed = parseStudentCsv(["Name,Rank", ",Blue belt", "Priya Raman,White belt"].join("\n"));
    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.problems[0].line, 2);
    assert.match(parsed.problems[0].message, /no student name/);
  });

  it("lists the columns it did not understand, so nothing vanishes quietly", () => {
    const parsed = parseStudentCsv(
      ["Name,Rank,Locker number,T-shirt size", "Marcus Okafor,Blue belt,14,YM"].join("\n"),
    );
    assert.ok(parsed.ignored.includes("Locker number"));
    assert.ok(parsed.ignored.includes("T-shirt size"));
    assert.ok(parsed.recognised.includes("rank"));
  });

  it("keeps a PIN only when it is long enough to be one", () => {
    const parsed = parseStudentCsv(
      ["Name,PIN", "Marcus Okafor,4821", "Amara Okafor,7", "Priya Raman,"].join("\n"),
    );
    assert.equal(parsed.rows[0].pin, "4821");
    assert.equal(parsed.rows[1].pin, null);
    assert.equal(parsed.rows[2].pin, null);
  });

  it("handles a quoted field containing a comma", () => {
    const parsed = parseStudentCsv(
      ['Name,Notes', 'Marcus Okafor,"Left knee, cleared by physio"'].join("\n"),
    );
    assert.equal(parsed.rows[0].notes, "Left knee, cleared by physio");
  });

  it("copes with an empty file and a header-only file", () => {
    assert.match(parseStudentCsv("").problems[0].message, /empty/);
    const headerOnly = parseStudentCsv("Name,Rank");
    assert.equal(headerOnly.rows.length, 0);
    assert.deepEqual(headerOnly.problems, []);
  });
});

describe("parseDateish", () => {
  it("reads the formats a US school's spreadsheet holds", () => {
    assert.equal(parseDateish("2026-03-15"), "2026-03-15");
    assert.equal(parseDateish("3/15/2026"), "2026-03-15");
    assert.equal(parseDateish("03/15/26"), "2026-03-15");
    assert.equal(parseDateish("Mar 15 2026"), "2026-03-15");
  });

  it("reinterprets day/month only when the first field cannot be a month", () => {
    assert.equal(parseDateish("15/03/2026"), "2026-03-15");
    // Ambiguous: resolves US-first, because that is who the buyer is.
    assert.equal(parseDateish("3/4/2026"), "2026-03-04");
  });

  it("returns null rather than guessing", () => {
    assert.equal(parseDateish(""), null);
    assert.equal(parseDateish("last spring"), null);
    assert.equal(parseDateish("13/13/2026"), null);
  });
});

describe("matchRank — loose enough to be useful, honest when it misses", () => {
  const ladder = [
    { id: "w", name: "White belt", stripes: 4 },
    { id: "b", name: "Blue belt", stripes: 4 },
    { id: "p", name: "Purple belt", stripes: 4 },
  ];

  it("matches exactly, loosely, and case-insensitively", () => {
    assert.deepEqual(matchRank(ladder, "Blue belt"), { rank: ladder[1], matched: true });
    assert.deepEqual(matchRank(ladder, "blue"), { rank: ladder[1], matched: true });
    assert.deepEqual(matchRank(ladder, "BLUE BELT"), { rank: ladder[1], matched: true });
    assert.deepEqual(matchRank(ladder, "Blue"), { rank: ladder[1], matched: true });
  });

  it("places an unknown rank at the bottom and reports the miss", () => {
    const result = matchRank(ladder, "Coral belt");
    assert.equal(result.rank.id, "w");
    assert.equal(result.matched, false, "an unmatched rank must be reported, not assumed");
  });

  it("places a student with no rank column at the bottom", () => {
    assert.deepEqual(matchRank(ladder, null), { rank: ladder[0], matched: false });
  });

  it("matches a kyu ladder's names through their suffixes", () => {
    const kyu = [
      { id: "10", name: "10th kyu — White", stripes: 2 },
      { id: "9", name: "9th kyu — Yellow", stripes: 2 },
    ];
    assert.equal(matchRank(kyu, "9th kyu — Yellow").matched, true);
    assert.equal(matchRank(kyu, "9th kyu - Yellow").matched, true);
  });
});

describe("CSV output", () => {
  it("quotes what needs quoting and nothing else", () => {
    assert.equal(csvEscape("Okafor"), "Okafor");
    assert.equal(csvEscape('Say "hello"'), '"Say ""hello"""');
    assert.equal(csvEscape("Reyes, Sofia"), '"Reyes, Sofia"');
    assert.equal(csvEscape(null), "");
    assert.equal(csvEscape(24), "24");
  });

  it("neutralises a value a spreadsheet would run as a formula", () => {
    assert.equal(csvEscape("=SUM(A1:A9)"), "'=SUM(A1:A9)");
    assert.equal(csvEscape("+1 512 555 0148"), "'+1 512 555 0148");
    assert.equal(csvEscape("-40"), "'-40");
  });

  it("writes CRLF rows with a header", () => {
    assert.equal(toCsv(["a", "b"], [[1, 2]]), "a,b\r\n1,2\r\n");
  });
});
