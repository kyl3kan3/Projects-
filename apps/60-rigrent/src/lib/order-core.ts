/**
 * src/lib/order-core.ts
 *
 * Order status, as of now — pure, and deliberately not a stored column.
 *
 * `orders.status` records what a person did: drafted, sent, accepted, took it
 * out, checked it back in. It does not record what the calendar did. "Overdue" is
 * not a decision anybody made; it is Tuesday. Storing it would need a cron to
 * reconcile, and a stored status a cron reconciles is how an invoice ends up
 * showing "Due" 212 days late in another app in this portfolio.
 *
 * So: `displayStatus` derives the badge from the stored status plus a date, every
 * render.
 */

import { daysBetween, type IsoDate } from "@/lib/dates";
import type { DepositStatus, OrderStatus } from "@/db/schema";

export type DisplayStatus =
  | "draft"
  | "sent"
  | "signed"
  | "confirmed"
  | "out"
  | "overdue"
  | "due_today"
  | "returned"
  | "closed"
  | "cancelled";

export interface OrderFacts {
  status: OrderStatus;
  outOn: IsoDate;
  dueBackOn: IsoDate;
}

export function displayStatus(order: OrderFacts, today: IsoDate): DisplayStatus {
  switch (order.status) {
    case "draft":
      return "draft";
    case "sent":
      return "sent";
    case "accepted":
      return "signed";
    case "confirmed":
      // A confirmed order past its out date has not been loaded. That is not
      // "overdue" — it is a yard that has not pressed the button yet — so it
      // stays "confirmed" and the run sheet is where it gets noticed.
      return "confirmed";
    case "out": {
      const late = daysBetween(order.dueBackOn, today);
      if (late > 0) return "overdue";
      if (late === 0) return "due_today";
      return "out";
    }
    case "returned":
      return "returned";
    case "closed":
      return "closed";
    case "cancelled":
      return "cancelled";
  }
}

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  signed: "Signed",
  confirmed: "Confirmed",
  out: "Out",
  due_today: "Due today",
  overdue: "Overdue",
  returned: "Returned",
  closed: "Closed",
  cancelled: "Cancelled",
};

/** Which of the three semantic tones the badge takes. Rust means trouble, only. */
export type StatusTone = "ink" | "dim" | "accent" | "warn" | "good";

export const STATUS_TONE: Record<DisplayStatus, StatusTone> = {
  draft: "dim",
  sent: "dim",
  signed: "accent",
  confirmed: "accent",
  out: "ink",
  due_today: "accent",
  overdue: "warn",
  returned: "ink",
  closed: "good",
  cancelled: "dim",
};

export const DEPOSIT_LABEL: Record<DepositStatus, string> = {
  none: "No deposit",
  held: "Held",
  captured_partial: "Part captured",
  captured: "Captured",
  released: "Released",
  expired: "Authorisation lapsed",
};

export const DEPOSIT_TONE: Record<DepositStatus, StatusTone> = {
  none: "dim",
  held: "accent",
  captured_partial: "warn",
  captured: "warn",
  released: "good",
  expired: "warn",
};

/** The statuses a quote can still be edited in. */
export function isEditable(status: OrderStatus): boolean {
  return status === "draft" || status === "sent";
}

/** The statuses that hold inventory. Mirrors BOOKED_STATUSES in availability-core. */
export function holdsInventory(status: OrderStatus): boolean {
  return status === "accepted" || status === "confirmed" || status === "out";
}

/** The next action the yard should take on this order, in one imperative sentence. */
export function nextAction(order: OrderFacts & { depositStatus: DepositStatus }, today: IsoDate): string {
  const display = displayStatus(order, today);
  switch (display) {
    case "draft":
      return "Send it to the customer to sign.";
    case "sent":
      return "Waiting on the customer's signature.";
    case "signed":
      return order.depositStatus === "held"
        ? "Signed and held. Ready to load."
        : "Signed. The deposit hold has not landed yet.";
    case "confirmed":
      return "Load it out when the truck goes.";
    case "out":
      return `Due back ${order.dueBackOn}. Check it in when it lands.`;
    case "due_today":
      return "Due back today — check it in on the returns queue.";
    case "overdue":
      return `Overdue by ${daysBetween(order.dueBackOn, today)} day(s). Chase the customer.`;
    case "returned":
      return "Checked in. Settle the deposit to close it.";
    case "closed":
      return "Closed.";
    case "cancelled":
      return "Cancelled.";
  }
}

/** `"40 × White folding chair, 4 × 6ft banquet table"` — for emails and load lists. */
export function itemSummary(
  lines: readonly { quantity: number; itemName: string }[],
  limit = 6,
): string {
  if (lines.length === 0) return "No lines on this order yet.";
  const shown = lines.slice(0, limit).map((l) => `${l.quantity} × ${l.itemName}`);
  const rest = lines.length - shown.length;
  return shown.join(", ") + (rest > 0 ? `, and ${rest} more line${rest === 1 ? "" : "s"}` : "");
}
