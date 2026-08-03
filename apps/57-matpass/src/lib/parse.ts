/**
 * Input parsing shared between server actions and their tests.
 *
 * These live here rather than beside the actions that use them for two reasons: a
 * `"use server"` module may only export async functions (every export is a public
 * endpoint), and a pure parser is worth testing without dragging the whole action
 * graph — and therefore the database client — into the test process.
 */

/** Dollars typed by a human -> integer cents. No float ever reaches the db. */
export function dollarsToCents(raw: string): number {
  const text = raw.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    throw new Error("Enter an amount like 149 or 149.50");
  }
  const [whole, fraction = ""] = text.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

/** "18:00" -> 1080. Rejects anything that is not a real time of day. */
export function parseTimeToMinutes(value: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) throw new Error("Enter the start time as HH:MM, e.g. 18:00");
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) throw new Error("That is not a time of day");
  return hours * 60 + minutes;
}
