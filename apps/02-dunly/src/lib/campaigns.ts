import type { CampaignStep, RetryScheduleEntry } from "../db/schema";
import { z } from "zod";

export interface RecoveryPlan {
  retries: Array<{ scheduledFor: Date; entry: RetryScheduleEntry }>;
  messages: Array<{ scheduledFor: Date; step: CampaignStep }>;
}

export const campaignStepSchema = z.object({
  offsetHours: z.number().int().min(-24 * 40).max(24 * 40),
  channel: z.enum(["email", "sms"]),
  templateId: z.string().min(2),
});

export const retryScheduleSchema = z.object({
  offsetHours: z.number().int().min(1).max(24 * 40),
});

export const defaultRetrySchedule: RetryScheduleEntry[] = [
  { offsetHours: 24 },
  { offsetHours: 72 },
  { offsetHours: 168 },
  { offsetHours: 336 },
];

export const defaultDunningSteps: CampaignStep[] = [
  { offsetHours: 1, channel: "email", templateId: "failed-payment-day-0" },
  { offsetHours: 72, channel: "email", templateId: "failed-payment-day-3" },
  { offsetHours: 120, channel: "sms", templateId: "failed-payment-sms-day-5" },
  { offsetHours: 168, channel: "email", templateId: "failed-payment-day-7" },
];

export const defaultPreDunningSteps: CampaignStep[] = [
  { offsetHours: -504, channel: "email", templateId: "card-expiry-t-21" },
  { offsetHours: -168, channel: "email", templateId: "card-expiry-t-7" },
  { offsetHours: -24, channel: "email", templateId: "card-expiry-t-1" },
];

function addHours(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

function nudgeRetryToTrustworthyWindow(date: Date): Date {
  const nudged = new Date(date);
  const day = nudged.getDay();
  if (day === 0) nudged.setDate(nudged.getDate() + 1);
  if (day === 6) nudged.setDate(nudged.getDate() + 2);
  nudged.setHours(9, 12, 0, 0);
  return nudged;
}

export function planRecovery(
  _failureId: string,
  _campaignId: string,
  options: { baseDate?: Date; includeSms?: boolean } = {},
): RecoveryPlan {
  const baseDate = options.baseDate ?? new Date();
  const includeSms = options.includeSms ?? true;
  const steps = defaultDunningSteps.filter((step) => includeSms || step.channel !== "sms");

  return {
    retries: defaultRetrySchedule.map((entry) => ({
      entry,
      scheduledFor: nudgeRetryToTrustworthyWindow(addHours(baseDate, entry.offsetHours)),
    })),
    messages: steps.map((step) => ({
      step,
      scheduledFor: addHours(baseDate, step.offsetHours),
    })),
  };
}

export function planPreDunning(
  _paymentMethodId: string,
  _campaignId: string,
  options: { renewalDate?: Date } = {},
): RecoveryPlan {
  const renewalDate = options.renewalDate ?? addHours(new Date(), 24 * 21);
  return {
    retries: [],
    messages: defaultPreDunningSteps.map((step) => ({
      step,
      scheduledFor: addHours(renewalDate, step.offsetHours),
    })),
  };
}

export async function cancelPlan(failureId: string): Promise<{ canceled: boolean; failureId: string }> {
  return { canceled: true, failureId };
}
