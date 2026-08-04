/**
 * src/lib/checkin-core.ts
 *
 * Check-off arithmetic for both ends of a rental, with no database in it.
 *
 * A check is three counts per line — clean, damaged, missing — and they have to
 * add up to the line quantity. Not "at most": exactly. A driver who checks 38 of
 * 40 chairs and moves on has not told the yard anything useful about the other
 * two, and "40 chairs, 38 accounted for" is the shape of a damage argument three
 * weeks later.
 */

export interface CheckCounts {
  quantityOk: number;
  quantityDamaged: number;
  quantityMissing: number;
}

export interface CheckLine extends CheckCounts {
  orderLineId: string;
  itemName: string;
  quantity: number;
}

export type CheckValidation = { ok: true } | { ok: false; error: string };

export function validateCounts(counts: CheckCounts, quantity: number): CheckValidation {
  const values = [counts.quantityOk, counts.quantityDamaged, counts.quantityMissing];
  if (values.some((v) => !Number.isInteger(v) || v < 0)) {
    return { ok: false, error: "Counts have to be whole numbers, none of them negative." };
  }
  const total = values.reduce((a, b) => a + b, 0);
  if (total !== quantity) {
    return {
      ok: false,
      error: `These add up to ${total}, and the line is ${quantity}. Every unit has to be accounted for as clean, damaged or missing.`,
    };
  }
  return { ok: true };
}

/** Was this check clean? Nothing damaged, nothing missing. */
export function isClean(counts: CheckCounts): boolean {
  return counts.quantityDamaged === 0 && counts.quantityMissing === 0;
}

export interface ReturnOutcome {
  /** Every line has an in-check. */
  complete: boolean;
  /** Complete and nothing damaged or missing anywhere. */
  clean: boolean;
  linesChecked: number;
  linesTotal: number;
  damagedTotal: number;
  missingTotal: number;
}

/**
 * Where a return stands. Derived from the checks, never stored — a stored
 * "clean/damaged" flag on the order would go stale the moment somebody corrects
 * a count, and then the deposit release would disagree with the photos.
 */
export function returnOutcome(
  lines: readonly { orderLineId: string; quantity: number }[],
  inChecks: readonly (CheckCounts & { orderLineId: string })[],
): ReturnOutcome {
  const byLine = new Map(inChecks.map((c) => [c.orderLineId, c]));
  let damagedTotal = 0;
  let missingTotal = 0;
  let linesChecked = 0;
  for (const line of lines) {
    const check = byLine.get(line.orderLineId);
    if (!check) continue;
    linesChecked += 1;
    damagedTotal += check.quantityDamaged;
    missingTotal += check.quantityMissing;
  }
  const complete = lines.length > 0 && linesChecked === lines.length;
  return {
    complete,
    clean: complete && damagedTotal === 0 && missingTotal === 0,
    linesChecked,
    linesTotal: lines.length,
    damagedTotal,
    missingTotal,
  };
}

/**
 * The load-out equivalent: a run is "loaded" when every line on every order in it
 * has an out-check. Same shape, deliberately — the driver's screen at the
 * warehouse and the driver's screen at the return are the same control.
 */
export function loadOutProgress(
  lines: readonly { orderLineId: string }[],
  outChecks: readonly { orderLineId: string }[],
): { checked: number; total: number; complete: boolean } {
  const done = new Set(outChecks.map((c) => c.orderLineId));
  const checked = lines.filter((l) => done.has(l.orderLineId)).length;
  return { checked, total: lines.length, complete: lines.length > 0 && checked === lines.length };
}
