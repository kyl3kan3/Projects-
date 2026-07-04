import { daysFromNow } from "./format";

export type FailureState = "recovering" | "recovered" | "lost" | "canceled";

export interface ActivityEvent {
  id: string;
  customer: string;
  amountCents: number;
  detail: string;
  time: string;
  kind: "retry" | "email" | "sms" | "baseline";
}

export interface TimelineNode {
  label: string;
  state: "succeeded" | "scheduled" | "failed" | "skipped";
  date: string;
}

export interface AtRiskFailure {
  id: string;
  customer: string;
  email: string;
  amountCents: number;
  declineCode: string;
  retryCountdown: string;
  status: FailureState;
  timeline: TimelineNode[];
}

export interface SequenceStep {
  id: string;
  kind: "EMAIL" | "SMS";
  day: string;
  subject: string;
  body: string;
  stats: string;
  channel: "email" | "sms";
}

export interface CampaignPerformance {
  name: string;
  recoveredCents: number;
  recoveryRate: number;
  messagesSent: number;
}

export const demoOrganization = {
  id: "org_demo",
  name: "Northstar Billing",
  plan: "growth" as const,
  stripeAccountId: "acct_demo_recovery",
  mrrUnderManagementCents: 82_400_00,
  senderDomain: "recover.northstarbilling.com",
};

export const dashboardStats = {
  recoveredByDunlyCents: 421_388,
  recoveredBaselineCents: 96_200,
  recoveryRate: 0.42,
  atRiskMrrCents: 186_000,
  activeFailures: 14,
  recoveryPreviewCents: 191_200,
  performanceChargeCents: 105_347,
};

export const activityEvents: ActivityEvent[] = [
  {
    id: "evt_1",
    customer: "Acme Design",
    amountCents: 4900,
    detail: "recovered via retry #2",
    time: "08:42",
    kind: "retry",
  },
  {
    id: "evt_2",
    customer: "Cedar Labs",
    amountCents: 14900,
    detail: "card updated from email day 3",
    time: "08:17",
    kind: "email",
  },
  {
    id: "evt_3",
    customer: "Morrow Studio",
    amountCents: 9900,
    detail: "baseline Stripe retry",
    time: "07:56",
    kind: "baseline",
  },
  {
    id: "evt_4",
    customer: "Ledgerline",
    amountCents: 29900,
    detail: "recovered after hosted card update",
    time: "Yesterday",
    kind: "email",
  },
];

export const atRiskFailures: AtRiskFailure[] = [
  {
    id: "fail_acme",
    customer: "Parallel Kitchen",
    email: "ops@parallelkitchen.co",
    amountCents: 14900,
    declineCode: "insufficient_funds",
    retryCountdown: "retry #3 in 2d 4h",
    status: "recovering",
    timeline: [
      { label: "fail", state: "failed", date: "Jul 1" },
      { label: "email", state: "succeeded", date: "Jul 1" },
      { label: "retry", state: "succeeded", date: "Jul 2" },
      { label: "retry", state: "scheduled", date: "Jul 6" },
    ],
  },
  {
    id: "fail_cedar",
    customer: "Cedar Labs",
    email: "billing@cedarlabs.io",
    amountCents: 5900,
    declineCode: "card_declined",
    retryCountdown: "email day 7 in 18h",
    status: "recovering",
    timeline: [
      { label: "fail", state: "failed", date: "Jul 2" },
      { label: "email", state: "succeeded", date: "Jul 2" },
      { label: "sms", state: "scheduled", date: "Jul 5" },
      { label: "retry", state: "scheduled", date: "Jul 7" },
    ],
  },
  {
    id: "fail_morrow",
    customer: "Morrow Studio",
    email: "founder@morrow.studio",
    amountCents: 29900,
    declineCode: "expired_card",
    retryCountdown: "card-update link opened 41m ago",
    status: "recovering",
    timeline: [
      { label: "fail", state: "failed", date: "Jul 3" },
      { label: "email", state: "succeeded", date: "Jul 3" },
      { label: "retry", state: "failed", date: "Jul 4" },
      { label: "retry", state: "scheduled", date: "Jul 8" },
    ],
  },
];

export const sequenceSteps: SequenceStep[] = [
  {
    id: "step_1",
    kind: "EMAIL",
    day: "1 hour",
    subject: "Your Northstar Billing payment did not go through",
    body: "Plain-language notice with the signed card-update link and no threats.",
    stats: "51% open - 18% click",
    channel: "email",
  },
  {
    id: "step_2",
    kind: "EMAIL",
    day: "day 3",
    subject: "Can we help update the card on file?",
    body: "A softer second touch with the invoice amount and expiry timeline.",
    stats: "44% open - 13% click",
    channel: "email",
  },
  {
    id: "step_3",
    kind: "SMS",
    day: "day 5",
    subject: "Short SMS nudge",
    body: "Growth-tier SMS only sends when the customer has consent.",
    stats: "96% delivered - 21% click",
    channel: "sms",
  },
  {
    id: "step_4",
    kind: "EMAIL",
    day: "day 7",
    subject: "Final reminder before access pauses",
    body: "States the consequence, still gives a clean update path.",
    stats: "39% open - 9% click",
    channel: "email",
  },
];

export const campaignPerformance: CampaignPerformance[] = [
  { name: "Default dunning", recoveredCents: 284_900, recoveryRate: 0.46, messagesSent: 68 },
  { name: "Card expiry", recoveredCents: 92_400, recoveryRate: 0.31, messagesSent: 24 },
  { name: "Hosted update page", recoveredCents: 44_088, recoveryRate: 0.58, messagesSent: 17 },
];

export const roiStatement = {
  period: "June 2026",
  recoveredCents: dashboardStats.recoveredByDunlyCents,
  baselineCents: dashboardStats.recoveredBaselineCents,
  atRiskCents: dashboardStats.atRiskMrrCents,
  subscriptionCents: 14_900,
  multiple: 28,
  rows: [
    ["Recovered by Dunly", dashboardStats.recoveredByDunlyCents],
    ["Baseline recoveries excluded", dashboardStats.recoveredBaselineCents],
    ["Still at risk", dashboardStats.atRiskMrrCents],
    ["Dunly fee", 14_900],
  ] as const,
};

export const cardUpdateDemo = {
  token: "demo-card-update-token",
  customer: "Cedar Labs",
  amountCents: 14900,
  expiresAt: daysFromNow(30),
};
