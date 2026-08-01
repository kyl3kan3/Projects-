import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { csvDocument, csvField } from "@/lib/csv";
import {
  ADP_HEADER,
  GUSTO_HEADER,
  adpBatchId,
  adpPayDate,
  blockingIssues,
  checksumOf,
  renderAdpCsv,
  renderExport,
  renderGustoCsv,
  splitName,
  validateExport,
  type ExportRow,
} from "@/lib/payroll-export";

const ROWS: ExportRow[] = [
  {
    userId: "u-1",
    name: "Miguel Ángel Ríos Vega",
    email: "miguel@hendricksconcrete.com",
    payrollFileNumber: "1042",
    regularCentihours: 4000,
    overtimeCentihours: 425,
    timeEntryIds: ["e-1", "e-2"],
  },
  {
    userId: "u-2",
    name: "Dale Hendricks",
    email: "dale@hendricksconcrete.com",
    payrollFileNumber: "1001",
    regularCentihours: 3799,
    overtimeCentihours: 0,
    timeEntryIds: ["e-3"],
  },
  {
    userId: "u-3",
    name: "Tasha Boone",
    email: "tasha@hendricksconcrete.com",
    payrollFileNumber: "1078",
    regularCentihours: 2250,
    overtimeCentihours: 0,
    timeEntryIds: ["e-4"],
  },
];

describe("the CSV writer", () => {
  it("quotes only what must be quoted", () => {
    assert.equal(csvField("Dale Hendricks"), "Dale Hendricks");
    assert.equal(csvField("Hendricks, Dale"), '"Hendricks, Dale"');
    assert.equal(csvField('He said "yes"'), '"He said ""yes"""');
    assert.equal(csvField(" padded "), '" padded "');
    assert.equal(csvField("line\nbreak"), '"line\nbreak"');
    assert.equal(csvField(null), "");
    assert.equal(csvField(0), "0");
  });

  it("ends every line with CRLF, including the last", () => {
    assert.equal(csvDocument(["a", "b"], [[1, 2]]), "a,b\r\n1,2\r\n");
  });
});

describe("name splitting for Gusto", () => {
  it("takes the final token as the surname", () => {
    assert.deepEqual(splitName("Dale Hendricks"), { first: "Dale", last: "Hendricks" });
  });

  it("keeps compound given names and two surnames intact on one side", () => {
    assert.deepEqual(splitName("Miguel Ángel Ríos Vega"), {
      first: "Miguel Ángel Ríos",
      last: "Vega",
    });
  });

  it("tolerates messy whitespace", () => {
    assert.deepEqual(splitName("  Tasha   Boone "), { first: "Tasha", last: "Boone" });
  });

  it("refuses to guess at a single-token name", () => {
    assert.equal(splitName("Chuy"), null);
    assert.equal(splitName("   "), null);
  });
});

describe("ADP", () => {
  it("renders the golden file byte for byte", () => {
    const csv = renderAdpCsv(ROWS, { companyCode: "H4K", periodEnd: "2026-02-28" });
    assert.equal(
      csv,
      "Co Code,Batch ID,File #,Reg Hours,O/T Hours,Pay Date\r\n" +
        "H4K,0228,1001,37.99,0.00,02/28/2026\r\n" +
        "H4K,0228,1042,40.00,4.25,02/28/2026\r\n" +
        "H4K,0228,1078,22.50,0.00,02/28/2026\r\n",
    );
  });

  it("keeps the header exactly as ADP's template spells it", () => {
    assert.deepEqual([...ADP_HEADER], [
      "Co Code",
      "Batch ID",
      "File #",
      "Reg Hours",
      "O/T Hours",
      "Pay Date",
    ]);
  });

  it("derives a stable batch id and US pay date from the period end", () => {
    assert.equal(adpBatchId("2026-02-28"), "0228");
    assert.equal(adpBatchId("2026-12-05"), "1205");
    assert.equal(adpPayDate("2026-02-28"), "02/28/2026");
  });

  it("sorts by file number, so two exports of one period are diffable", () => {
    const shuffled = [ROWS[2], ROWS[0], ROWS[1]];
    assert.equal(
      renderAdpCsv(shuffled, { companyCode: "H4K", periodEnd: "2026-02-28" }),
      renderAdpCsv(ROWS, { companyCode: "H4K", periodEnd: "2026-02-28" }),
    );
  });
});

describe("Gusto", () => {
  it("renders the golden file byte for byte", () => {
    const csv = renderGustoCsv(ROWS);
    assert.equal(
      csv,
      "last_name,first_name,employee_email,regular_hours,overtime_hours\r\n" +
        "Boone,Tasha,tasha@hendricksconcrete.com,22.50,0.00\r\n" +
        "Hendricks,Dale,dale@hendricksconcrete.com,37.99,0.00\r\n" +
        "Vega,Miguel Ángel Ríos,miguel@hendricksconcrete.com,40.00,4.25\r\n",
    );
  });

  it("keeps Gusto's snake_case header", () => {
    assert.deepEqual([...GUSTO_HEADER], [
      "last_name",
      "first_name",
      "employee_email",
      "regular_hours",
      "overtime_hours",
    ]);
  });

  it("routes through renderExport by format", () => {
    assert.equal(
      renderExport("gusto", ROWS, { companyCode: "H4K", periodEnd: "2026-02-28" }),
      renderGustoCsv(ROWS),
    );
    assert.equal(
      renderExport("adp", ROWS, { companyCode: "H4K", periodEnd: "2026-02-28" }),
      renderAdpCsv(ROWS, { companyCode: "H4K", periodEnd: "2026-02-28" }),
    );
  });
});

describe("re-export reproducibility", () => {
  it("produces the same checksum for the same period", () => {
    const first = renderAdpCsv(ROWS, { companyCode: "H4K", periodEnd: "2026-02-28" });
    const second = renderAdpCsv([...ROWS].reverse(), {
      companyCode: "H4K",
      periodEnd: "2026-02-28",
    });
    assert.equal(checksumOf(first), checksumOf(second));
    assert.equal(checksumOf(first).length, 16);
  });

  it("changes the checksum when an hour changes", () => {
    const a = renderAdpCsv(ROWS, { companyCode: "H4K", periodEnd: "2026-02-28" });
    const b = renderAdpCsv(
      [{ ...ROWS[0], regularCentihours: 4001 }, ROWS[1], ROWS[2]],
      { companyCode: "H4K", periodEnd: "2026-02-28" },
    );
    assert.notEqual(checksumOf(a), checksumOf(b));
  });
});

describe("the pre-export validator", () => {
  const base = {
    weekStartsOn: 0,
    periodStart: "2026-02-22",
    periodEnd: "2026-02-28",
    openEntries: [],
    unapprovedCount: 0,
  };

  it("passes a clean ADP export", () => {
    const issues = validateExport(ROWS, { ...base, format: "adp", adpCompanyCode: "H4K" });
    assert.deepEqual(issues, []);
  });

  it("blocks an ADP export with no company code", () => {
    const issues = validateExport(ROWS, { ...base, format: "adp", adpCompanyCode: null });
    assert.equal(blockingIssues(issues).length, 1);
    assert.equal(issues[0].code, "missing_company_code");
  });

  it("blocks a worker with no ADP file number, naming them", () => {
    const rows = [{ ...ROWS[0], payrollFileNumber: null }, ROWS[1], ROWS[2]];
    const issues = validateExport(rows, { ...base, format: "adp", adpCompanyCode: "H4K" });
    const issue = issues.find((i) => i.code === "missing_file_number");
    assert.ok(issue);
    assert.equal(issue!.name, "Miguel Ángel Ríos Vega");
    assert.equal(issue!.severity, "block");
  });

  it("blocks a Gusto export with a missing email or an unsplittable name", () => {
    const rows: ExportRow[] = [
      { ...ROWS[0], email: null },
      { ...ROWS[1], name: "Chuy" },
    ];
    const issues = validateExport(rows, { ...base, format: "gusto", adpCompanyCode: null });
    assert.ok(issues.some((i) => i.code === "missing_email"));
    assert.ok(issues.some((i) => i.code === "unsplittable_name"));
    assert.equal(blockingIssues(issues).length, 2);
  });

  it("blocks on a shift still open inside the period", () => {
    const issues = validateExport(ROWS, {
      ...base,
      format: "adp",
      adpCompanyCode: "H4K",
      openEntries: [{ userId: "u-2", name: "Dale Hendricks" }],
    });
    const issue = issues.find((i) => i.code === "open_entry");
    assert.equal(issue?.severity, "block");
  });

  it("blocks an empty period rather than emitting a header-only file", () => {
    const issues = validateExport([], { ...base, format: "adp", adpCompanyCode: "H4K" });
    assert.equal(issues[0].code, "no_rows");
    assert.equal(issues[0].severity, "block");
  });

  it("warns, but does not block, on unapproved entries", () => {
    const issues = validateExport(ROWS, {
      ...base,
      format: "adp",
      adpCompanyCode: "H4K",
      unapprovedCount: 4,
    });
    assert.equal(issues.length, 1);
    assert.equal(issues[0].code, "unapproved");
    assert.equal(issues[0].count, 4);
    assert.deepEqual(blockingIssues(issues), []);
  });

  it("warns when the period cuts a workweek in half", () => {
    const issues = validateExport(ROWS, {
      ...base,
      format: "adp",
      adpCompanyCode: "H4K",
      periodStart: "2026-02-16",
      periodEnd: "2026-02-28",
    });
    assert.ok(issues.some((i) => i.code === "period_splits_week" && i.severity === "warn"));
  });

  it("accepts an aligned biweekly period", () => {
    const issues = validateExport(ROWS, {
      ...base,
      format: "adp",
      adpCompanyCode: "H4K",
      periodStart: "2026-02-15",
      periodEnd: "2026-02-28",
    });
    assert.deepEqual(issues, []);
  });
});
