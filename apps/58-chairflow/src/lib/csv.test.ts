import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseImport, parseLooseDate, splitCsvLine, splitName } from "@/lib/csv";

test("quoted fields survive commas and doubled quotes", () => {
  assert.deepEqual(splitCsvLine('Marcus,+15125550147,marcus@example.com'), [
    "Marcus",
    "+15125550147",
    "marcus@example.com",
  ]);
  assert.deepEqual(splitCsvLine('"Ollet, Marcus",512-555-0147'), [
    "Ollet, Marcus",
    "512-555-0147",
  ]);
  assert.deepEqual(splitCsvLine('"Says ""hi""",x'), ['Says "hi"', "x"]);
  assert.deepEqual(splitCsvLine("a,,c"), ["a", "", "c"]);
});

test("a Square-shaped export imports with cadences seeded", () => {
  const csv = [
    "Name,Phone,Email,Last Visit",
    "Marcus Ollet,(512) 555-0147,marcus@example.com,06/26/2026",
    '"Priya Raman",512-555-0182,priya@example.com,2026-07-02',
    "Dee,+15125550190,,2026-05-14",
  ].join("\n");
  const parsed = parseImport(csv);
  assert.equal(parsed.problems.length, 0);
  assert.equal(parsed.rows.length, 3);
  assert.deepEqual(parsed.rows[0], {
    line: 2,
    firstName: "Marcus",
    lastName: "Ollet",
    phone: "+15125550147",
    email: "marcus@example.com",
    lastVisitOn: "2026-06-26",
  });
  assert.equal(parsed.rows[1].firstName, "Priya");
  assert.equal(parsed.rows[1].lastName, "Raman");
  assert.equal(parsed.rows[2].lastName, null);
  assert.equal(parsed.rows[2].email, null);
});

test("a quoted \"Last, First\" name is not read as a first name with a comma in it", () => {
  assert.deepEqual(splitName("Okafor, Nia"), { firstName: "Nia", lastName: "Okafor" });
  assert.deepEqual(splitName("Marcus Ollet"), { firstName: "Marcus", lastName: "Ollet" });
  assert.deepEqual(splitName("Dee"), { firstName: "Dee", lastName: null });
  assert.deepEqual(splitName("  Priya  Raman  "), { firstName: "Priya", lastName: "Raman" });
  assert.deepEqual(splitName("Ollet,"), { firstName: "Ollet", lastName: null });
  assert.deepEqual(splitName(""), { firstName: "", lastName: null });

  const parsed = parseImport('Name,Phone\n"Okafor, Nia",5125550211');
  assert.equal(parsed.rows[0].firstName, "Nia");
  assert.equal(parsed.rows[0].lastName, "Okafor");
});

test("separate first/last name columns are honoured over a combined one", () => {
  const csv = ["First Name,Last Name,Mobile", "Ana,Beltrán,5125550111"].join("\n");
  const parsed = parseImport(csv);
  assert.equal(parsed.rows[0].firstName, "Ana");
  assert.equal(parsed.rows[0].lastName, "Beltrán");
  assert.equal(parsed.rows[0].phone, "+15125550111");
});

test("every rejected row comes back with its line number and a reason", () => {
  const csv = [
    "Name,Phone,Last Visit",
    "Good One,5125550100,2026-06-01",
    "No Phone,,2026-06-01",
    "Bad Phone,12,2026-06-01",
    "Duplicate,512-555-0100,2026-06-02",
  ].join("\n");
  const parsed = parseImport(csv);
  assert.equal(parsed.rows.length, 1, "silently dropping rows would be worse than refusing");
  assert.equal(parsed.problems.length, 3);
  assert.deepEqual(
    parsed.problems.map((p) => p.line),
    [3, 4, 5],
  );
  assert.match(parsed.problems[2].reason, /Duplicate/);
});

test("a file with no phone column is refused, because phone is the client's identity", () => {
  const parsed = parseImport("Name,Email\nMarcus,marcus@example.com");
  assert.equal(parsed.rows.length, 0);
  assert.match(parsed.problems[0].reason, /phone/i);
});

test("a file with no name column is refused", () => {
  const parsed = parseImport("Phone,Email\n5125550100,marcus@example.com");
  assert.equal(parsed.rows.length, 0);
  assert.match(parsed.problems[0].reason, /name/i);
});

test("an unreadable date imports the client but warns, rather than guessing", () => {
  const parsed = parseImport("Name,Phone,Last Visit\nMarcus,5125550100,sometime last spring");
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].lastVisitOn, null);
  assert.equal(parsed.problems.length, 1);
  assert.match(parsed.problems[0].reason, /no cadence yet/);
});

test("an unreadable email imports the client but warns", () => {
  const parsed = parseImport("Name,Phone,Email\nMarcus,5125550100,marcus at example");
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].email, null);
  assert.equal(parsed.problems.length, 1);
});

test("loose dates parse the shapes scheduling apps export, and refuse the rest", () => {
  assert.equal(parseLooseDate("2026-06-26"), "2026-06-26");
  assert.equal(parseLooseDate("2026-06-26T14:00:00Z"), "2026-06-26");
  assert.equal(parseLooseDate("6/26/2026"), "2026-06-26");
  assert.equal(parseLooseDate("26 Jun 2026"), "2026-06-26");
  assert.equal(parseLooseDate("Jun 26, 2026"), "2026-06-26");
  assert.equal(parseLooseDate("2026-02-31"), null, "not a real day");
  assert.equal(parseLooseDate("26/06/2026"), null, "month 26 does not exist");
  assert.equal(parseLooseDate(""), null);
  assert.equal(parseLooseDate("last Tuesday"), null);
});

test("an empty file is an empty import, not a crash", () => {
  assert.deepEqual(parseImport(""), { rows: [], problems: [], mapping: {} });
  assert.deepEqual(parseImport("\n\n  \n").rows, []);
});
