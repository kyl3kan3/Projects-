/**
 * Supplier and cost CSV import.
 *
 * A merchant's lead times and unit costs already live in a spreadsheet — that is the
 * incumbent this product is replacing — so the import has to be forgiving about how
 * that spreadsheet is shaped. It accepts any column order, case-insensitive headers,
 * a handful of common aliases, quoted fields, `$1,299.00` money, and both CRLF and LF.
 *
 * It is *not* forgiving about ambiguity: a row it cannot map to a SKU is reported
 * with its line number rather than skipped silently. A silent skip is how a merchant
 * ends up with a forecast built on a default lead time they thought they had
 * overridden.
 *
 * Parsing is pure and separate from the database write, so every one of these
 * decisions is unit-tested.
 */

export interface SupplierCsvRow {
  line: number;
  sku: string;
  supplierName: string | null;
  supplierEmail: string | null;
  leadTimeDays: number | null;
  minOrderValueCents: number | null;
  costCents: number | null;
  moq: number | null;
  packSize: number | null;
}

export interface SupplierCsvParse {
  rows: SupplierCsvRow[];
  errors: string[];
  /** Headers we recognised, for the "we read these columns" line in the UI. */
  recognised: string[];
  ignored: string[];
}

const ALIASES: Record<string, string> = {
  sku: "sku",
  "variant sku": "sku",
  "product sku": "sku",
  supplier: "supplier",
  "supplier name": "supplier",
  vendor: "supplier",
  "supplier email": "supplierEmail",
  email: "supplierEmail",
  "lead time": "leadTimeDays",
  "lead time days": "leadTimeDays",
  leadtime: "leadTimeDays",
  lead_time_days: "leadTimeDays",
  "min order": "minOrderValue",
  "minimum order": "minOrderValue",
  "min order value": "minOrderValue",
  cost: "cost",
  "unit cost": "cost",
  "cost per unit": "cost",
  moq: "moq",
  "minimum order quantity": "moq",
  "pack size": "packSize",
  pack: "packSize",
  "case size": "packSize",
};

/** RFC4180-ish: quoted fields, doubled quotes inside them, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  // Strip a UTF-8 BOM: Excel writes one, and it would otherwise become part of the
  // first header name and break every column match.
  const input = text.replace(/^﻿/, "");

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** "$1,299.00" -> 129900. Returns null for anything that is not a number. */
export function moneyToCents(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.\-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

function intOrNull(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9\-]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? Math.round(value) : null;
}

export function parseSupplierCsv(text: string): SupplierCsvParse {
  const table = parseCsv(text);
  if (!table.length) {
    return { rows: [], errors: ["That file had no rows in it."], recognised: [], ignored: [] };
  }

  const header = table[0].map((cell) => cell.trim().toLowerCase());
  const mapping = header.map((name) => ALIASES[name] ?? null);
  const recognised: string[] = [];
  const ignored: string[] = [];
  header.forEach((name, index) => {
    if (mapping[index]) recognised.push(name);
    else if (name) ignored.push(name);
  });

  const skuIndex = mapping.indexOf("sku");
  if (skuIndex === -1) {
    return {
      rows: [],
      errors: [
        `No SKU column found. The header row needs one of: SKU, Variant SKU, Product SKU. Found: ${header.filter(Boolean).join(", ") || "nothing"}.`,
      ],
      recognised,
      ignored,
    };
  }

  const rows: SupplierCsvRow[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const line = r + 1;
    const get = (key: string): string => {
      const index = mapping.indexOf(key);
      return index === -1 ? "" : (cells[index] ?? "").trim();
    };

    const sku = (cells[skuIndex] ?? "").trim();
    if (!sku) {
      errors.push(`Line ${line}: no SKU, so there is nothing to attach this row to.`);
      continue;
    }
    if (seen.has(sku)) {
      errors.push(`Line ${line}: ${sku} appears more than once — the last row wins.`);
    }
    seen.add(sku);

    const leadTime = intOrNull(get("leadTimeDays"));
    if (get("leadTimeDays") && leadTime === null) {
      errors.push(`Line ${line}: lead time "${get("leadTimeDays")}" is not a number of days.`);
    }
    if (leadTime !== null && (leadTime < 0 || leadTime > 365)) {
      errors.push(`Line ${line}: lead time ${leadTime} is outside 0-365 days.`);
    }

    rows.push({
      line,
      sku,
      supplierName: get("supplier") || null,
      supplierEmail: get("supplierEmail") || null,
      leadTimeDays: leadTime !== null && leadTime >= 0 && leadTime <= 365 ? leadTime : null,
      minOrderValueCents: get("minOrderValue") ? moneyToCents(get("minOrderValue")) : null,
      costCents: get("cost") ? moneyToCents(get("cost")) : null,
      moq: intOrNull(get("moq")),
      packSize: intOrNull(get("packSize")),
    });
  }

  return { rows, errors, recognised, ignored };
}

/** The template offered on the import screen, so the first attempt works. */
export const SUPPLIER_CSV_TEMPLATE = `SKU,Supplier,Supplier email,Lead time days,Unit cost,MOQ,Pack size,Min order value
OAK-SACH-06,Apex Goods Co.,orders@apexgoods.example,18,8.90,100,24,500.00
OAK-BLKT-07,Northbay Textiles,po@northbaytextiles.example,34,59.00,40,10,1200.00
OAK-HOOK-02,Kettle & Co,purchasing@kettleandco.example,7,15.50,24,6,150.00
`;
