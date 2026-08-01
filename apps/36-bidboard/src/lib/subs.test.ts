import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseCsv, parseSubImport } from "./subs";
import { divisionStamp, parseDivision } from "./csi";

test("parseCsv survives quotes, doubled quotes and CRLF", () => {
  const text =
    'Company,Contact,Email\r\n"Voss & Sons, Inc.",Hal Voss,hal@voss.example\r\n"He said ""fine""",Ann,ann@x.example\r\n';
  assert.deepEqual(parseCsv(text), [
    ["Company", "Contact", "Email"],
    ["Voss & Sons, Inc.", "Hal Voss", "hal@voss.example"],
    ['He said "fine"', "Ann", "ann@x.example"],
  ]);
});

test("parseCsv drops blank lines but keeps blank fields", () => {
  assert.deepEqual(parseCsv("a,,c\n\n\nd,e,f"), [
    ["a", "", "c"],
    ["d", "e", "f"],
  ]);
});

test("a real bookkeeper's spreadsheet imports", () => {
  const csv = [
    "Company Name,Contact,Email Address,Phone,Divisions,City",
    "Meridian Electric,Dana Reyes,dana@meridian-elec.example,503-555-0142,26;27,Portland",
    'Voss Mechanical,"Hal Voss, PE",hal@vossmech.example,(503) 555-0199,Div 23 / 22,Beaverton',
    "Cass Ridge Drywall,,office@cassridge.example,,Drywall,Gresham",
  ].join("\n");

  const preview = parseSubImport(csv);
  assert.equal(preview.skipped.length, 0);
  assert.equal(preview.rows.length, 3);

  assert.deepEqual(preview.rows[0], {
    company: "Meridian Electric",
    contactName: "Dana Reyes",
    email: "dana@meridian-elec.example",
    phone: "503-555-0142",
    trades: ["26", "27"],
    city: "Portland",
    notes: null,
  });

  // Trades split on the slash, and "Div 23" becomes 23.
  assert.deepEqual(preview.rows[1].trades, ["23", "22"]);
  // A missing contact name falls back to the email's local part rather than blank.
  assert.equal(preview.rows[2].contactName, "office");
  assert.deepEqual(preview.rows[2].trades, ["09"]);
});

test("rows that would produce an invite nobody receives are skipped with a reason", () => {
  const csv = [
    "Company,Contact,Email",
    "Northfield Roofing,Pat,pat@northfield.example",
    "Missing Email Co,Sam,not-an-email",
    ",Orphan Contact,orphan@x.example",
  ].join("\n");

  const preview = parseSubImport(csv);
  assert.equal(preview.rows.length, 1);
  assert.deepEqual(
    preview.skipped.map((s) => [s.line, s.reason]),
    [
      [3, "no usable email address"],
      [4, "no company name"],
    ],
  );
});

test("an email in the wrong column is still found", () => {
  const csv = ["Company,Contact,Email", "Pike Street Glass,glass@pike.example,"].join("\n");
  const preview = parseSubImport(csv);
  assert.equal(preview.rows.length, 1);
  assert.equal(preview.rows[0].email, "glass@pike.example");
});

test("a sheet with no header row is still read", () => {
  const csv = "Harlan Voss Electric,Hal,hal@harlan.example,5035550100,26";
  const preview = parseSubImport(csv);
  assert.equal(preview.rows.length, 1);
  assert.equal(preview.rows[0].company, "Harlan Voss Electric");
  assert.deepEqual(preview.rows[0].trades, ["26"]);
  assert.deepEqual(preview.skipped, []);
});

test("empty input is empty, not an error", () => {
  assert.deepEqual(parseSubImport("").rows, []);
  assert.deepEqual(parseSubImport("   \n  ").rows, []);
});

test("parseDivision reads what people actually type, and refuses the rest", () => {
  assert.equal(parseDivision("26"), "26");
  assert.equal(parseDivision("Div 26"), "26");
  assert.equal(parseDivision("26 - Electrical"), "26");
  assert.equal(parseDivision("electrical"), "26");
  assert.equal(parseDivision("HVAC"), "23");
  assert.equal(parseDivision("Fire Sprinkler"), "21");
  assert.equal(parseDivision("3"), "03");
  // Not a trade we carry, and not guessable: null, never a wrong division.
  assert.equal(parseDivision("elevator"), null);
  assert.equal(parseDivision(""), null);
  assert.equal(parseDivision("99"), null);
});

test("division stamps are strings, so 03 stays 03", () => {
  assert.equal(divisionStamp("03"), "03 · CONCRETE");
  assert.equal(divisionStamp("26"), "26 · ELECTRICAL");
});
