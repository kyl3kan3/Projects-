import type { AttributionSource } from "../db/schema";
import { activityEvents, atRiskFailures, campaignPerformance, dashboardStats } from "./sample-data";

export interface DashboardStats {
  recoveredByDunlyCents: number;
  recoveredBaselineCents: number;
  recoveryRate: number;
  atRiskMrrCents: number;
  activeFailures: number;
}

export interface AttributionResult {
  source: AttributionSource;
  recoveryAttemptId?: string;
  messageId?: string;
  amountCents: number;
}

export function attributeRecovery(
  stripeInvoiceId: string,
): Promise<AttributionResult> {
  const seed = stripeInvoiceId.charCodeAt(stripeInvoiceId.length - 1) % 4;
  const source: AttributionSource = (["retry", "email", "sms", "baseline"] as const)[seed];
  return Promise.resolve({
    source,
    recoveryAttemptId: source === "retry" ? `att_${stripeInvoiceId}` : undefined,
    messageId: source === "email" || source === "sms" ? `msg_${stripeInvoiceId}` : undefined,
    amountCents: seed === 0 ? 4900 : seed === 1 ? 14900 : 9900,
  });
}

export function getDashboardStats(
  _orgId: string,
  _range: { from: Date; to: Date },
): Promise<DashboardStats> {
  void _orgId;
  void _range;
  return Promise.resolve(dashboardStats);
}

export function getRecoveryPreview(_stripeAccountId: string): Promise<{
  failedInvoices: number;
  atRiskCents: number;
  likelyRecoveredCents: number;
}> {
  void _stripeAccountId;
  return Promise.resolve({
    failedInvoices: 31,
    atRiskCents: 682_400,
    likelyRecoveredCents: dashboardStats.recoveryPreviewCents,
  });
}

export function computePerformancePlanCharge(_orgId: string, _month: Date): Promise<number> {
  void _orgId;
  void _month;
  return Promise.resolve(Math.min(Math.round(dashboardStats.recoveredByDunlyCents * 0.25), 200_000));
}

export function getFailureDrilldown(failureId: string) {
  const failure = atRiskFailures.find((item) => item.id === failureId) ?? atRiskFailures[0];
  return {
    failure,
    events: activityEvents.filter((event) => event.kind !== "baseline"),
  };
}

export function getCampaignPerformance() {
  return campaignPerformance;
}
