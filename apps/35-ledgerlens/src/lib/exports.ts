/**
 * src/lib/exports.ts
 *
 * Export formats for the monthly close package. The accountant handoff is
 * the product; these files must import cleanly with zero manual mapping.
 *
 * TODO:
 * - [ ] toGenericCsv(lineItems): date, vendor, category, memo, amount, tax,
 *       currency, source filename.
 * - [ ] toQboCsv(lineItems): 3-column + 4-column QuickBooks Online bank/
 *       expense import formats (Date, Description, Amount [, Category]) --
 *       validate against a real QBO import screen, including date format
 *       (MM/DD/YYYY) and sign conventions.
 * - [ ] toXeroCsv(lineItems): Xero precoded-import columns (Date, Amount,
 *       Payee, Description, AccountCode) -- validate against a real Xero org.
 * - [ ] Escaping: RFC 4180 quoting, BOM for Excel friendliness, UTF-8.
 * - [ ] Amounts always from integer cents -> decimal at the last moment;
 *       never floats anywhere upstream.
 * - [ ] Every export call writes an audit_log row (what, who, when).
 */

export function toGenericCsv(): string {
  throw new Error("Not implemented");
}

export function toQboCsv(): string {
  throw new Error("Not implemented");
}

export function toXeroCsv(): string {
  throw new Error("Not implemented");
}
