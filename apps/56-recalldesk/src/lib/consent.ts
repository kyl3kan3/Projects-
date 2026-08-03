/**
 * src/lib/consent.ts
 *
 * THE consent chokepoint, as one pure decision function.
 *
 * Every outbound touch in RecallDesk — campaign email, campaign SMS, nothing
 * else — passes `decideTouch`. It takes a flat snapshot of the facts and returns
 * either `{ ok: true }` or a named reason, and it is the only place any of these
 * rules live. Keeping it pure is deliberate: a gate that needs a database, a
 * request and a clock to test is a gate that ends up tested once and then trusted
 * forever.
 *
 * The rules, in the order a compliance auditor would ask about them:
 *
 *   do_not_contact  — the practice said never. Beats everything.
 *   opted_out       — the patient said STOP (SMS) or unsubscribed (email).
 *                     Permanent per channel: nothing re-enables it except an
 *                     explicit new consent, and no import ever clears it.
 *   no_consent      — no consent flag for the channel, or no address/number.
 *   bounced         — the address hard-bounced or the number failed. Sending
 *                     again damages the practice's sending domain.
 *   touch_cap       — the campaign's max touches for this patient is reached.
 *   quiet_hours     — outside the location's local sending window.
 *   send_cap        — the location's hourly pacing cap is used up.
 *
 * `quiet_hours` and `send_cap` are *retryable* — the touch waits. The rest are
 * terminal for this patient/channel and stop the enrollment rather than
 * re-queueing it forever.
 */

import { hourInTimezone } from "@/lib/dates";

export type TouchDenial =
  | "do_not_contact"
  | "opted_out"
  | "no_consent"
  | "bounced"
  | "touch_cap"
  | "quiet_hours"
  | "send_cap";

export type TouchDecision =
  | { ok: true }
  | { ok: false; reason: TouchDenial; retryable: boolean; detail: string };

/** Denials that mean "not now"; everything else means "not ever, this way". */
const RETRYABLE: TouchDenial[] = ["quiet_hours", "send_cap"];

export function isRetryable(reason: TouchDenial): boolean {
  return RETRYABLE.includes(reason);
}

export function denialLabel(reason: TouchDenial): string {
  switch (reason) {
    case "do_not_contact":
      return "Do not contact";
    case "opted_out":
      return "Opted out";
    case "no_consent":
      return "No consent on file";
    case "bounced":
      return "Contact failed previously";
    case "touch_cap":
      return "Touch cap reached";
    case "quiet_hours":
      return "Quiet hours";
    case "send_cap":
      return "Hourly send cap";
  }
}

/** Everything the gate is allowed to know. IDs and flags only — no free text. */
export interface TouchFacts {
  channel: "email" | "sms";
  patient: {
    doNotContact: boolean;
    status: "active" | "inactive" | "merged";
    email: string | null;
    phone: string | null;
    emailConsent: boolean;
    smsConsent: boolean;
    emailOptedOutAt: Date | null;
    smsOptedOutAt: Date | null;
    emailBouncedAt: Date | null;
    phoneFailedAt: Date | null;
  };
  location: {
    timezone: string;
    quietStartHour: number;
    quietEndHour: number;
    hourlySendCap: number;
  };
  /** Touches already sent to this patient by this campaign. */
  touchesInCampaign: number;
  /** The campaign's per-patient cap. */
  maxTouchesPerPatient: number;
  /** Touches this location has already sent in the current hour. */
  sentThisHour: number;
  now: Date;
}

function deny(reason: TouchDenial, detail: string): TouchDecision {
  return { ok: false, reason, retryable: isRetryable(reason), detail };
}

export function decideTouch(facts: TouchFacts): TouchDecision {
  const { patient: p, location: l, channel } = facts;

  if (p.doNotContact) {
    return deny("do_not_contact", "The practice marked this patient do-not-contact.");
  }
  if (p.status !== "active") {
    return deny("no_consent", `Patient record is ${p.status}.`);
  }

  if (channel === "email") {
    if (p.emailOptedOutAt) {
      return deny("opted_out", "This patient unsubscribed from email. Permanent.");
    }
    if (!p.email || !p.emailConsent) {
      return deny("no_consent", p.email ? "No email consent on file." : "No email address on file.");
    }
    if (p.emailBouncedAt) {
      return deny("bounced", "This address hard-bounced; sending again hurts deliverability.");
    }
  } else {
    if (p.smsOptedOutAt) {
      return deny("opted_out", "This patient replied STOP. Permanent, per TCPA.");
    }
    if (!p.phone || !p.smsConsent) {
      return deny(
        "no_consent",
        p.phone ? "No SMS consent on file — SMS needs imported or explicit consent." : "No mobile number on file.",
      );
    }
    if (p.phoneFailedAt) {
      return deny("bounced", "This number failed delivery; it is suppressed for SMS.");
    }
  }

  if (facts.maxTouchesPerPatient > 0 && facts.touchesInCampaign >= facts.maxTouchesPerPatient) {
    return deny(
      "touch_cap",
      `Already had ${facts.touchesInCampaign} of ${facts.maxTouchesPerPatient} touches from this campaign.`,
    );
  }

  if (!withinQuietHours(l, facts.now)) {
    const hour = hourInTimezone(l.timezone, facts.now);
    return deny(
      "quiet_hours",
      `It is ${String(hour).padStart(2, "0")}:00 at this location; sending runs ${l.quietStartHour}:00–${l.quietEndHour}:00.`,
    );
  }

  if (facts.sentThisHour >= l.hourlySendCap) {
    return deny("send_cap", `This location has sent its ${l.hourlySendCap} touches for this hour.`);
  }

  return { ok: true };
}

/**
 * Is it an acceptable hour to reach a patient, in the *location's* timezone?
 *
 * Server time is irrelevant and would be actively wrong: a Vercel function in
 * us-east deciding it is 9am for a practice in Anchorage is a 5am text message.
 */
export function withinQuietHours(
  location: { timezone: string; quietStartHour: number; quietEndHour: number },
  now: Date = new Date(),
): boolean {
  const hour = hourInTimezone(location.timezone, now);
  const start = clampHour(location.quietStartHour, 9);
  const end = clampHour(location.quietEndHour, 19);
  // A window that wraps midnight is not a thing we allow — a practice cannot
  // configure 22:00-08:00 sending by accident.
  if (end <= start) return hour >= start;
  return hour >= start && hour < end;
}

function clampHour(v: number, fallback: number): number {
  return Number.isInteger(v) && v >= 0 && v <= 23 ? v : fallback;
}

/**
 * The next instant sending may resume, given a retryable denial. Used to set
 * `enrollments.next_send_at` so a quiet-hours block waits for the morning rather
 * than being retried every fifteen minutes all night.
 */
export function nextSendableAt(
  location: { timezone: string; quietStartHour: number; quietEndHour: number },
  now: Date = new Date(),
): Date {
  if (withinQuietHours(location, now)) return now;
  const start = clampHour(location.quietStartHour, 9);
  // Walk forward in whole hours until the location's local clock is inside the
  // window. At most 24 steps, and it needs no timezone-offset arithmetic of our
  // own — Intl already knows about DST.
  for (let i = 1; i <= 24; i++) {
    const candidate = new Date(now.getTime() + i * 3_600_000);
    if (withinQuietHours(location, candidate)) {
      // Land on the top of the opening hour rather than mid-hour.
      const hour = hourInTimezone(location.timezone, candidate);
      if (hour === start) {
        return new Date(Math.floor(candidate.getTime() / 3_600_000) * 3_600_000);
      }
      return candidate;
    }
  }
  return new Date(now.getTime() + 3_600_000);
}
