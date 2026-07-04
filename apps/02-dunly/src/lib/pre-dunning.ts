import { planPreDunning } from "./campaigns";
import { cardUpdateDemo } from "./sample-data";

export async function scanExpiringCards() {
  const renewalDate = new Date();
  renewalDate.setDate(renewalDate.getDate() + 21);

  const plan = planPreDunning("pm_demo_expiring", "campaign_pre_dunning", {
    renewalDate,
  });

  return {
    scannedPaymentMethods: 14,
    expiringCards: 3,
    campaignsStarted: 3,
    stoppedBecauseCardUpdated: 1,
    nextCardUpdateUrl: `/card-update/${cardUpdateDemo.token}`,
    messages: plan.messages.map((message) => ({
      channel: message.step.channel,
      templateId: message.step.templateId,
      scheduledFor: message.scheduledFor.toISOString(),
    })),
  };
}
