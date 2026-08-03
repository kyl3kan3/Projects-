import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyLine,
  exclusionFor,
  guessMapping,
  parseAmountToCents,
  parseSpendCsv,
  readCsvHeaders,
  summarise,
  validateSuggestions,
} from "./spend";
import { ValidationError } from "./errors";

const CSV = `Date,Account,Description,Amount
01/14/2025,5100 - Freight,"XPO Logistics LTL freight",1248.00
01/19/2025,6000 - Payroll,"Payroll 01/15 semi-monthly",42980.55
01/22/2025,5200 - Utilities,"Consolidated Edison electricity",993.53
01/28/2025,5400 - Materials,"Ryerson steel bar stock",8410.20
02/02/2025,5900 - Software,"Autodesk Fusion subscription",680.00
02/09/2025,6100 - Taxes,"NY State sales tax remittance",3120.00
02/14/2025,5410 - Shop,"Grainger Industrial Supply order 8841",412.66
02/20/2025,5300 - Rent,"Warehouse rent February",6500.00
02/24/2025,5990 - Misc,"Refund - returned tooling",(430.19)
`;

/* ------------------------------------------------------------------- money --- */

test("amounts parse to integer cents in the shapes a GL export prints", () => {
  assert.equal(parseAmountToCents("1248.00"), 124_800);
  assert.equal(parseAmountToCents("$1,248.00"), 124_800);
  assert.equal(parseAmountToCents("1248"), 124_800);
  assert.equal(parseAmountToCents("£680.50"), 68_050);
  assert.equal(parseAmountToCents("1.248,00"), 124_800);
});

test("parentheses and a leading minus both mean a credit", () => {
  assert.equal(parseAmountToCents("(430.19)"), -43_019);
  assert.equal(parseAmountToCents("-430.19"), -43_019);
});

test("an unreadable amount is null, never zero", () => {
  assert.equal(parseAmountToCents("n/a"), null);
  assert.equal(parseAmountToCents(""), null);
  assert.equal(parseAmountToCents("12.34.56"), null);
});

/* ----------------------------------------------------------------- mapping --- */

test("headers are read and a mapping is proposed from them", () => {
  const file = readCsvHeaders(CSV);
  assert.deepEqual(file.headers, ["Date", "Account", "Description", "Amount"]);
  assert.equal(file.rowCount, 9);
  assert.equal(file.sample.length, 5);
  assert.deepEqual(guessMapping(file.headers), {
    description: "Description",
    amount: "Amount",
    glAccount: "Account",
    date: "Date",
  });
});

test("a mapping without a description or amount column is refused", () => {
  assert.throws(
    () => parseSpendCsv(CSV, { description: "", amount: "Amount", glAccount: "", date: "" }),
    ValidationError,
  );
});

test("pointing the amount column at text is refused rather than importing zeros", () => {
  assert.throws(
    () =>
      parseSpendCsv(CSV, {
        description: "Description",
        amount: "Description",
        glAccount: "",
        date: "",
      }),
    ValidationError,
  );
});

test("rows parse with file row numbers so an operator can find them again", () => {
  const rows = parseSpendCsv(CSV, guessMapping(readCsvHeaders(CSV).headers));
  assert.equal(rows.length, 9);
  assert.equal(rows[0].rowNumber, 2);
  assert.equal(rows[0].amountCents, 124_800);
  assert.equal(rows[0].spendDate, "2025-01-14");
  assert.equal(rows[8].amountCents, -43_019);
});

/* -------------------------------------------------------------- exclusions --- */

test("payroll, tax, depreciation and transfers are excluded with reasons", () => {
  assert.match(exclusionFor("Payroll 01/15 semi-monthly")!, /Payroll/);
  assert.match(exclusionFor("NY State sales tax remittance")!, /Tax/);
  assert.match(exclusionFor("Depreciation - plant")!, /Depreciation/);
  assert.match(exclusionFor("Intercompany transfer to GreenTally UK")!, /Intra-company/);
  assert.match(exclusionFor("Loan repayment - equipment note")!, /Financing/);
});

test("electricity and fuel spend is excluded because Scope 1 and 2 already counted it", () => {
  const elec = classifyLine("Consolidated Edison electricity", "5200 - Utilities");
  assert.equal(elec.excluded, true);
  assert.match(elec.exclusionReason, /Scope 2/);
  const fuel = classifyLine("Shell fuel card - diesel", "5600 - Vehicles");
  assert.equal(fuel.excluded, true);
  assert.match(fuel.exclusionReason, /Scope 1/);
});

test("an excluded line still shows what it was, so the exclusion is auditable", () => {
  const elec = classifyLine("Consolidated Edison electricity", "5200 - Utilities");
  assert.equal(elec.eeioCategory, "purchased_electricity");
});

test("a purchase that merely mentions a fuel word is not excluded wholesale", () => {
  // "power tools" is a genuine purchase; the electricity rule must not swallow it.
  const tools = classifyLine("Milwaukee power tools - impact driver", "5410 - Shop");
  assert.equal(tools.excluded, false);
});

/* ---------------------------------------------------------- classification --- */

test("keyword rules classify the obvious lines", () => {
  assert.equal(classifyLine("XPO Logistics LTL freight").eeioCategory, "freight_trucking");
  assert.equal(classifyLine("Ryerson steel bar stock").eeioCategory, "iron_steel");
  assert.equal(classifyLine("Autodesk Fusion subscription").eeioCategory, "software_it_services");
  assert.equal(classifyLine("Warehouse rent February").eeioCategory, "real_estate_leasing");
});

test("a longer keyword wins over a shorter one it contains", () => {
  assert.equal(classifyLine("United Rentals equipment rental - lift").eeioCategory, "equipment_rental");
});

test("an unmatched line is left unclassified with a reason, never guessed", () => {
  const c = classifyLine("Journal entry 4471 reclass");
  assert.equal(c.eeioCategory, null);
  assert.equal(c.excluded, false);
  assert.match(c.reason, /assign a category/i);
});

test("model suggestions are filtered against what was actually asked", () => {
  const lines = [{ rowNumber: 2 }, { rowNumber: 3 }];
  const out = validateSuggestions(
    [
      { row: 2, category: "freight_trucking", confidence: 0.9 },
      { row: 3, category: "not_a_real_category", confidence: 0.99 },
      { row: 99, category: "freight_trucking", confidence: 0.99 },
      { row: 2, category: "iron_steel", confidence: 0.5 },
    ],
    lines,
  );
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { rowNumber: 2, eeioCategory: "freight_trucking", confidenceBp: 9_000 });
});

test("the model may not assign an already-counted category", () => {
  const out = validateSuggestions(
    [{ row: 2, category: "purchased_electricity", confidence: 0.99 }],
    [{ rowNumber: 2 }],
  );
  assert.deepEqual(out, []);
});

/* -------------------------------------------------------------- summarising --- */

test("the summary separates included, excluded and unclassified spend", () => {
  const rows = parseSpendCsv(CSV, guessMapping(readCsvHeaders(CSV).headers));
  const classified = rows.map((r) => {
    const c = classifyLine(r.description, r.glAccount);
    return {
      amountCents: r.amountCents,
      eeioCategory: c.eeioCategory,
      excluded: c.excluded,
      exclusionReason: c.exclusionReason,
    };
  });
  const s = summarise(classified);
  assert.equal(s.rows, 9);
  assert.equal(s.excludedRows, 3, "payroll, tax and electricity");
  assert.ok(s.includedRows >= 5);
  assert.equal(s.includedRows + s.excludedRows + s.unclassifiedRows, 9);
  assert.ok(s.byReason.length >= 3);
  assert.ok(s.byReason.every((r) => r.reason.length > 0), "every exclusion carries a reason");
});

test("a thousand-line file classifies in one pass", () => {
  const header = "Date,Account,Description,Amount\n";
  const body = Array.from({ length: 1000 }, (_, i) => {
    const kinds = [
      "XPO Logistics LTL freight",
      "Grainger Industrial Supply order",
      "Payroll semi-monthly",
      "Ryerson steel bar stock",
      "Journal entry reclass",
    ];
    return `03/0${(i % 9) + 1}/2025,5100,"${kinds[i % kinds.length]} ${i}",${100 + i}.00`;
  }).join("\n");
  const rows = parseSpendCsv(header + body, guessMapping(["Date", "Account", "Description", "Amount"]));
  assert.equal(rows.length, 1000);
  const classified = rows.map((r) => classifyLine(r.description, r.glAccount));
  assert.equal(classified.filter((c) => c.excluded).length, 200);
  assert.equal(classified.filter((c) => !c.excluded && c.eeioCategory).length, 600);
  assert.equal(classified.filter((c) => !c.excluded && !c.eeioCategory).length, 200);
});
