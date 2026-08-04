/**
 * src/lib/holds.ts
 *
 * The authorisation-hold lifecycle, as pure arithmetic.
 *
 * A card authorisation is not permanent: networks release it after about seven
 * days whether anyone wants them to or not. A three-week tent rental therefore
 * needs the hold re-placed before it lapses, and getting that wrong is a silent
 * failure — the gear goes out, the hold quietly evaporates, and the yard finds
 * out when a damaged marquee comes back with nothing to draw on.
 *
 * Two defects from elsewhere in this portfolio are designed against here:
 *
 *  - **A sweep that never stops.** "Expired" stays true for ever, so a naive
 *    daily pass would try to re-authorise the same dead hold every night until
 *    the end of time. `needsReauth` is false once the hold is past its life, and
 *    `reauthWindow` bounds the sweep to orders that can still move.
 *  - **A ladder that goes silent.** The re-auth decision is a distance from a
 *    fixed event (the authorisation timestamp), not a threshold that can be
 *    crossed once and forgotten.
 */

import { addDays, daysBetween, isoDateOf, type IsoDate } from "@/lib/dates";
import { HOLD_LIFETIME_DAYS, REAUTH_LEAD_DAYS } from "@/lib/deposit-gateway";

export interface HoldFacts {
  depositStatus: string;
  depositCents: number;
  depositAuthorizedAt: Date | null;
  dueBackOn: IsoDate;
  status: string;
}

/** The last day the current authorisation can still be captured. */
export function holdExpiresOn(authorizedAt: Date): IsoDate {
  return addDays(isoDateOf(authorizedAt), HOLD_LIFETIME_DAYS);
}

export function holdDaysLeft(authorizedAt: Date, asOf: IsoDate): number {
  return daysBetween(asOf, holdExpiresOn(authorizedAt));
}

/**
 * Does this order's hold need re-placing today?
 *
 * True when the hold is live, the rental is still out (or not yet back), and the
 * authorisation runs out before the gear is due — with `REAUTH_LEAD_DAYS` of
 * runway so a declined re-auth can be chased rather than discovered.
 *
 * False once the authorisation is already past its lifetime: at that point there
 * is nothing to re-authorise and the order is flagged `expired` instead, which is
 * a state a human has to look at.
 */
export function needsReauth(order: HoldFacts, asOf: IsoDate): boolean {
  if (order.depositStatus !== "held") return false;
  if (order.depositCents <= 0) return false;
  if (!order.depositAuthorizedAt) return false;
  if (order.status === "closed" || order.status === "cancelled") return false;

  const expiresOn = holdExpiresOn(order.depositAuthorizedAt);
  if (expiresOn <= asOf) return false; // already lapsed — see holdHasLapsed
  // Nothing to do while the gear is due back before the authorisation runs out.
  if (order.dueBackOn <= expiresOn) return false;
  return daysBetween(asOf, expiresOn) <= REAUTH_LEAD_DAYS;
}

/** A hold whose authorisation has already run out. Needs a person, not a retry. */
export function holdHasLapsed(order: HoldFacts, asOf: IsoDate): boolean {
  if (order.depositStatus !== "held" || !order.depositAuthorizedAt) return false;
  return holdExpiresOn(order.depositAuthorizedAt) <= asOf;
}

/**
 * The half-open range of `deposit_authorized_at` dates worth *re-authorising*,
 * `[authorizedFrom, authorizedTo)`. An authorisation older than
 * `HOLD_LIFETIME_DAYS` has already lapsed and cannot be saved (see
 * `lapsedBefore`); a newer one than `authorizedTo` still has runway.
 * `needsReauth` still decides each candidate.
 */
export function reauthWindow(asOf: IsoDate): { authorizedFrom: IsoDate; authorizedTo: IsoDate } {
  return {
    authorizedFrom: addDays(asOf, -HOLD_LIFETIME_DAYS),
    authorizedTo: addDays(asOf, REAUTH_LEAD_DAYS - HOLD_LIFETIME_DAYS + 1),
  };
}

/**
 * Any `held` authorisation placed before this date has already lapsed and needs
 * flagging for a person.
 *
 * This is deliberately a separate, *older-than* bound rather than part of
 * `reauthWindow`, and the reason is a bug this file shipped with for an hour: the
 * re-auth window starts at `asOf − HOLD_LIFETIME_DAYS`, so a hold that lapsed
 * while the cron was down for two days fell out of the window entirely and was
 * never flagged. The order kept saying "held" for an authorisation that no longer
 * existed — a yard believing it has a deposit it does not have, which is the exact
 * silent failure this module exists to prevent.
 *
 * It is still bounded work: flagging moves the row to `expired`, which takes it
 * out of this set for ever. Each row is examined at most once more, which is what
 * "bound the sweep to the window that can move" actually means — the answer can
 * change exactly once, and then it cannot.
 */
export function lapsedBefore(asOf: IsoDate): IsoDate {
  return addDays(asOf, -HOLD_LIFETIME_DAYS);
}

/** A sentence for the order screen. Says what will happen, not just what is. */
export function holdSentence(order: HoldFacts, asOf: IsoDate): string {
  if (order.depositStatus === "none") return "No deposit hold on this order.";
  if (order.depositStatus === "released") return "Deposit hold released. No money moved.";
  if (order.depositStatus === "captured") return "Deposit captured in full against damage claims.";
  if (order.depositStatus === "captured_partial") {
    return "Part of the deposit was captured against damage claims; the rest was released.";
  }
  if (order.depositStatus === "expired") {
    return "The card authorisation lapsed before the gear came back. Re-authorise it or settle by invoice.";
  }
  if (!order.depositAuthorizedAt) return "Deposit hold pending.";
  const left = holdDaysLeft(order.depositAuthorizedAt, asOf);
  if (left <= 0) {
    return "The card authorisation has run out — re-authorise before claiming any damage.";
  }
  return `Held. This authorisation runs out in ${left} day${left === 1 ? "" : "s"} (${holdExpiresOn(order.depositAuthorizedAt)}).`;
}
