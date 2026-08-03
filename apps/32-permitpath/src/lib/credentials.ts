/**
 * Credential vocabulary. Pure module — the licence vault's client components
 * import it for labels, and nothing here reaches the database.
 */

import type { CredentialKind } from "@/db/schema";
import { daysUntil } from "@/lib/format";

export const CREDENTIAL_KINDS: CredentialKind[] = [
  "contractor_license",
  "trade_registration",
  "business_license",
  "insurance_cert",
];

export const CREDENTIAL_LABEL: Record<CredentialKind, string> = {
  contractor_license: "Contractor licence",
  trade_registration: "Trade registration",
  business_license: "Business licence",
  insurance_cert: "Insurance certificate",
};

/** What the field asks for, so the form does not need a help article. */
export const CREDENTIAL_HINT: Record<CredentialKind, string> = {
  contractor_license: "ROC licence number, e.g. ROC 318472",
  trade_registration: "City or county trade registration number",
  business_license: "Municipal business licence or TPT number",
  insurance_cert: "Policy number on the certificate of insurance",
};

export type CredentialStatus = "current" | "expiring" | "expired";

/**
 * Status derived from the date, every time it is read. There is no stored flag to
 * go stale: a certificate that lapsed on Tuesday reads expired on Wednesday
 * whether or not any sweep has run.
 */
export function credentialStatus(expiresAt: Date, now: Date = new Date()): CredentialStatus {
  const days = daysUntil(expiresAt, now);
  if (days < 0) return "expired";
  if (days <= 60) return "expiring";
  return "current";
}

export const CREDENTIAL_STATUS_LABEL: Record<CredentialStatus, string> = {
  current: "Current",
  expiring: "Renewal due",
  expired: "Expired",
};
