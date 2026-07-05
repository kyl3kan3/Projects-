/** The three per-seat plans from README.md. */

export interface Plan {
  id: "starter" | "pro" | "business";
  name: string;
  perSeatMonthly: number;
  recordingHours: number | null; // null = unlimited (fair use)
  crmSync: boolean;
  features: string[];
}

export const PLANS: Record<Plan["id"], Plan> = {
  starter: {
    id: "starter",
    name: "Starter",
    perSeatMonthly: 19,
    recordingHours: 20,
    crmSync: false,
    features: [
      "Bot joins Zoom / Meet / Teams",
      "Transcription + AI summary",
      "Action items + decisions",
      "Slack delivery",
      "20 recording hours / user",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    perSeatMonthly: 39,
    recordingHours: 40,
    crmSync: true,
    features: [
      "Everything in Starter",
      "CRM sync (HubSpot)",
      "Field-level write-back",
      "Per-deal intelligence timeline",
      "40 recording hours / user",
    ],
  },
  business: {
    id: "business",
    name: "Business",
    perSeatMonthly: 49,
    recordingHours: null,
    crmSync: true,
    features: [
      "Everything in Pro",
      "Custom extraction playbooks",
      "Manager digest + analytics",
      "SSO / SAML, audit log",
      "Unlimited hours (fair use)",
    ],
  },
};

export const TRIAL_DAYS = 14;
