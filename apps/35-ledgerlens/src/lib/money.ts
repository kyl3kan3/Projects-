/**
 * Money is integer cents, everywhere, always.
 *
 * A receipt total is the number an accountant will put on a tax return. Floats
 * lose it — `0.1 + 0.2` is the canonical example and `19.99 * 3` is the one that
 * actually shows up in a category subtotal. Nothing in this app multiplies or sums
 * dollars: parsing happens once at the edge (`parseAmountToCents`), formatting
 * happens once at the other edge (`formatCents`), and everything between is an
 * integer.
 */

export function formatCents(cents: number, currency = "USD"): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  const symbol = currencySymbol(currency);
  return `${sign}${symbol}${groupDigits(whole)}.${frac}`;
}

/** Dollars and cents split apart, so the cents can be typeset at 60% size. */
export function splitCents(cents: number, currency = "USD"): { whole: string; frac: string } {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  return {
    whole: `${sign}${currencySymbol(currency)}${groupDigits(Math.floor(abs / 100))}`,
    frac: String(abs % 100).padStart(2, "0"),
  };
}

/** Plain decimal for CSV columns — no symbol, no grouping, always two places. */
export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function currencySymbol(currency: string): string {
  switch (currency.toUpperCase()) {
    case "USD":
    case "CAD":
    case "AUD":
      return "$";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    default:
      return "";
  }
}

function groupDigits(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * Parse a human-entered or receipt-printed amount into cents without ever
 * building a float. Accepts `1,234.56`, `$1234.5`, `1234`, `(12.00)` (a credit),
 * `-12.00`, `1.234,56` (European grouping). Returns null when it cannot tell.
 */
export function parseAmountToCents(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[^\d.,+-]/g, "");
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  if (!s || !/\d/.test(s)) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let decimalSep = "";
  if (lastComma >= 0 && lastDot >= 0) {
    decimalSep = lastComma > lastDot ? "," : ".";
  } else if (lastComma >= 0) {
    // A lone comma is a decimal separator only when it is followed by 1-2 digits
    // and there is no other comma — "1,234" is grouping, "12,34" is European.
    const after = s.length - lastComma - 1;
    decimalSep = after > 0 && after <= 2 && s.indexOf(",") === lastComma ? "," : "";
  } else if (lastDot >= 0) {
    const after = s.length - lastDot - 1;
    decimalSep = after > 0 && after <= 2 && s.indexOf(".") === lastDot ? "." : "";
  }

  let whole: string;
  let frac = "";
  if (decimalSep) {
    const idx = s.lastIndexOf(decimalSep);
    whole = s.slice(0, idx);
    frac = s.slice(idx + 1);
  } else {
    whole = s;
  }
  whole = whole.replace(/[.,]/g, "");
  frac = frac.replace(/[.,]/g, "");
  if (!whole && !frac) return null;
  const cents = Number(whole || "0") * 100 + Number(frac.padEnd(2, "0").slice(0, 2) || "0");
  if (!Number.isFinite(cents)) return null;
  return negative ? -cents : cents;
}

/** Percentage of a total, in whole percent, rounded once — for the close summary. */
export function percentOf(part: number, whole: number): number {
  if (whole === 0) return 0;
  return Math.round((part / whole) * 100);
}
