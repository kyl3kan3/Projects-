/**
 * src/lib/dates.ts
 *
 * THE product: the critical-date engine. Pure functions over the
 * holiday table.
 *
 * computeDate(rule, anchors, holidays):
 *   - offsetDays from the anchor, calendar or business days
 *   - weekend roll (forward) when the landing day is Sat/Sun and the
 *     rule observes business days
 *   - holiday observance per the rule + scope calendar
 * Every result carries its derivation sentence ("contract + 10
 * business days, MLK Day observed") — the UI renders it verbatim.
 *
 * TODO:
 * - [ ] computeDate(rule, anchors, holidays): { dueOn, sentence }.
 * - [ ] computeAll(template, anchors, holidays): instantiation.
 * - [ ] diff(oldDates, newDates): [{ key, oldDue, newDue, reason }]
 *       for the recompute preview.
 * - [ ] Test suite: month boundaries, back-to-back holidays,
 *       Friday-contract weekend rolls, leap years.
 */

export interface DateRule {
  anchor: "contract_date" | "acceptance_date" | "closing_date";
  offsetDays: number;
  businessDays: boolean;
  observeHolidays: boolean;
}

export interface ComputedDate {
  key: string;
  label: string;
  dueOn: string;
  sentence: string;
}

export function computeDate(
  rule: DateRule,
  anchors: Record<string, string>,
  holidays: Set<string>,
): { dueOn: string; sentence: string } {
  throw new Error("Not implemented");
}

export function diffDates(
  oldDates: ComputedDate[],
  newDates: ComputedDate[],
): Array<{ key: string; oldDue: string; newDue: string; reason: string }> {
  throw new Error("Not implemented");
}
