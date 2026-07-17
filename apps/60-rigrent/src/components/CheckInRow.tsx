/**
 * CheckInRow — return check-in per order line (DESIGN.md screen 7).
 *
 * Clean/damaged/missing steppers that must sum to the line quantity,
 * camera button for in-photos, and the claim drafter that opens when
 * damaged/missing > 0 (fee schedule pre-filled, photos attached).
 *
 * TODO: 56px row height (driver gloves); stepper validation; the
 * settle tick on completion; claim draft handoff.
 */

"use client";

export interface CheckInRowProps {
  orderLineId: string;
  itemName: string;
  quantity: number;
}

export function CheckInRow(props: CheckInRowProps) {
  void props;
  return <div className="row">Not implemented</div>;
}
