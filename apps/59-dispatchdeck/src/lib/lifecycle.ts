/**
 * src/lib/lifecycle.ts
 *
 * The load lifecycle as pure functions: what the cab's ONE button does next,
 * what the status becomes, and where the hazard thread has got to.
 *
 * Kept free of any database import so the cab card, the board row and the
 * landing-page device can all render it in the browser.
 *
 * The order matters and is not the naive one. "First stop without an arrival"
 * is wrong: with a pickup and a delivery, arriving at the pickup would make the
 * delivery the first unarrived stop and the driver would be asked to arrive at
 * the receiver while still sitting on the shipper's dock. Stops are walked in
 * sequence and each one is finished — arrive, then depart — before the next is
 * offered.
 */

import type { LoadStatus } from "@/db/schema";

export interface ThreadStop {
  id: string;
  seq: number;
  kind: "pickup" | "delivery";
  facility: string | null;
  city: string;
  state: string;
  windowStart: Date | string | null;
  windowEnd: Date | string | null;
  arrivedAt: Date | string | null;
  departedAt: Date | string | null;
}

export type AdvanceKind = "dispatch" | "arrive" | "depart";

export interface NextAction {
  kind: AdvanceKind;
  /** The button's words. The cab shows exactly this. */
  label: string;
  /** One line under the button saying what it will record. */
  detail: string;
  stop: ThreadStop | null;
  /** The status the load lands in once this action is applied. */
  nextStatus: LoadStatus;
  /** True when applying this needs a POD document on the load first. */
  requiresPod: boolean;
}

const ACTIVE: LoadStatus[] = ["booked", "dispatched", "at_shipper", "in_transit"];

export function isActive(status: LoadStatus): boolean {
  return ACTIVE.includes(status);
}

export function sortStops<T extends { seq: number }>(stops: T[]): T[] {
  return [...stops].sort((a, b) => a.seq - b.seq);
}

function stopName(stop: ThreadStop): string {
  return stop.facility?.trim() || `${stop.city}, ${stop.state}`;
}

/**
 * The single next legal move, or null when there is nothing left for the cab to
 * do (delivered, invoiced, paid, cancelled).
 */
export function nextAction(
  load: { status: LoadStatus },
  stopList: ThreadStop[],
): NextAction | null {
  if (!isActive(load.status)) return null;
  const stops = sortStops(stopList);

  if (load.status === "booked") {
    const first = stops[0] ?? null;
    return {
      kind: "dispatch",
      label: "Start this load",
      detail: first
        ? `Marks it dispatched and sets ${stopName(first)} as your next stop.`
        : "Marks it dispatched.",
      stop: null,
      nextStatus: "dispatched",
      requiresPod: false,
    };
  }

  for (const stop of stops) {
    if (!stop.arrivedAt) {
      return {
        kind: "arrive",
        label: stop.kind === "pickup" ? "Arrived at shipper" : "Arrived at receiver",
        detail: `Stamps your arrival at ${stopName(stop)} and starts the detention clock.`,
        stop,
        nextStatus: stop.kind === "pickup" ? "at_shipper" : "in_transit",
        requiresPod: false,
      };
    }
    if (!stop.departedAt) {
      const isLast = stop.seq === stops[stops.length - 1].seq;
      const delivering = stop.kind === "delivery";
      return {
        kind: "depart",
        label: delivering ? (isLast ? "Delivered — done" : "Unloaded — rolling") : "Loaded — rolling",
        detail: delivering
          ? isLast
            ? "Stamps the delivery and closes the load out. Needs the signed BOL photographed."
            : `Stamps the unload at ${stopName(stop)}.`
          : `Stamps departure from ${stopName(stop)}.`,
        stop,
        nextStatus: delivering && isLast ? "delivered" : "in_transit",
        requiresPod: delivering && isLast,
      };
    }
  }

  // Every stop stamped but the load is still open: the last stop was a pickup
  // (a badly built load). Close it out rather than stranding the driver.
  return {
    kind: "depart",
    label: "Delivered — done",
    detail: "Closes the load out. Needs the signed BOL photographed.",
    stop: null,
    nextStatus: "delivered",
    requiresPod: true,
  };
}

/**
 * Where the hazard thread has reached, 0..1. The thread has one segment per
 * stamp plus the dispatch stamp at the top, so a two-stop load has five.
 */
export function threadPosition(load: { status: LoadStatus }, stopList: ThreadStop[]): number {
  if (load.status === "cancelled") return 0;
  if (load.status === "delivered" || load.status === "invoiced" || load.status === "paid") return 1;
  const stops = sortStops(stopList);
  const steps = 1 + stops.length * 2;
  let done = load.status === "booked" ? 0 : 1;
  for (const stop of stops) {
    if (stop.arrivedAt) done += 1;
    if (stop.departedAt) done += 1;
  }
  return steps === 0 ? 0 : Math.min(1, done / steps);
}

/**
 * The stop the driver is standing at right now, if any — the one with an
 * arrival and no departure. This is what the detention clock reads.
 */
export function currentStop(stopList: ThreadStop[]): ThreadStop | null {
  for (const stop of sortStops(stopList)) {
    if (stop.arrivedAt && !stop.departedAt) return stop;
  }
  return null;
}

/** The next stop the driver is headed for, if any. */
export function nextStop(stopList: ThreadStop[]): ThreadStop | null {
  for (const stop of sortStops(stopList)) {
    if (!stop.arrivedAt) return stop;
  }
  return null;
}

/**
 * A human placard for the load's position, which is not always the raw status:
 * a driver sitting on the receiver's dock is "in_transit" in the database but
 * "At receiver" on the card.
 */
export function positionPlacard(load: { status: LoadStatus }, stopList: ThreadStop[]): string {
  const here = currentStop(stopList);
  if (load.status === "in_transit" && here?.kind === "delivery") return "At receiver";
  if (load.status === "in_transit" && here?.kind === "pickup") return "At shipper";
  switch (load.status) {
    case "booked":
      return "Booked";
    case "dispatched":
      return "Dispatched";
    case "at_shipper":
      return "At shipper";
    case "in_transit":
      return "In transit";
    case "delivered":
      return "Delivered";
    case "invoiced":
      return "Invoiced";
    case "paid":
      return "Paid";
    case "cancelled":
      return "Cancelled";
  }
}

/**
 * Guard for the office: which statuses may be set by hand. The cab advances
 * with `nextAction`; the office may only cancel, or walk a delivered load
 * forward through billing, and may never jump the cab's stamps.
 */
export function canCancel(status: LoadStatus): boolean {
  return status !== "paid" && status !== "cancelled" && status !== "invoiced";
}

export function canInvoice(status: LoadStatus): boolean {
  return status === "delivered";
}
