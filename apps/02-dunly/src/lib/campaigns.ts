/**
 * Sequence templates. Every org gets defaults on signup; steps are stored
 * as jsonb and edited in the sequence editor. Offsets are hours from the
 * failure (dunning) or from detection (pre-dunning, negative = before renewal).
 */

import { eq, and } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CampaignStep } from "@/db/schema";
import { DEFAULT_RETRY_SCHEDULE } from "@/lib/retries";

export const DEFAULT_DUNNING_STEPS: CampaignStep[] = [
  { offsetHours: 1, channel: "email", templateKey: "dunning_1_heads_up" },
  { offsetHours: 72, channel: "email", templateKey: "dunning_2_reminder" },
  { offsetHours: 168, channel: "email", templateKey: "dunning_3_urgent" },
  { offsetHours: 312, channel: "email", templateKey: "dunning_4_final" },
];

export const DEFAULT_PRE_DUNNING_STEPS: CampaignStep[] = [
  { offsetHours: 0, channel: "email", templateKey: "predunning_1_expiring" },
  { offsetHours: 336, channel: "email", templateKey: "predunning_2_last_call" },
];

export async function ensureDefaultCampaigns(organizationId: string): Promise<void> {
  const existing = await db.query.recoveryCampaigns.findFirst({
    where: eq(schema.recoveryCampaigns.organizationId, organizationId),
  });
  if (existing) return;
  await db.insert(schema.recoveryCampaigns).values([
    {
      organizationId,
      type: "dunning",
      trigger: "payment_failed",
      name: "Failed payment recovery",
      steps: DEFAULT_DUNNING_STEPS,
      retrySchedule: DEFAULT_RETRY_SCHEDULE,
      active: true,
    },
    {
      organizationId,
      type: "pre_dunning",
      trigger: "card_expiring",
      name: "Card expiring soon",
      steps: DEFAULT_PRE_DUNNING_STEPS,
      retrySchedule: [],
      active: true,
    },
  ]);
}

export async function activeCampaign(organizationId: string, type: "dunning" | "pre_dunning") {
  return db.query.recoveryCampaigns.findFirst({
    where: and(
      eq(schema.recoveryCampaigns.organizationId, organizationId),
      eq(schema.recoveryCampaigns.type, type),
      eq(schema.recoveryCampaigns.active, true),
    ),
  });
}
