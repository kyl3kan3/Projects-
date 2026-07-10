/**
 * Contract templates: merge-field resolution + tamper-evident hashing.
 * E-sign validity (ESIGN/UETA) rests on: intent-to-sign, consent to
 * electronic business, association of signature with the record, and a
 * tamper-evident audit trail — all recorded on the signatures row and the
 * frozen body's SHA-256.
 */
import { createHash } from "node:crypto";

export interface MergeData {
  client: { name: string; email?: string; partnerName?: string };
  session?: { date: string; type?: string; location?: string };
  invoice?: { total: string; deposit: string };
  studio: { name: string };
}

/** Resolve {{client.name}}-style merge fields. Unknown fields are left blank. */
export function mergeContract(body: string, data: MergeData): string {
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path: string) => {
    const parts = path.split(".");
    let cur: unknown = data;
    for (const p of parts) {
      if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[p];
      else return "";
    }
    return typeof cur === "string" ? cur : "";
  });
}

/** Tamper evidence: hash the frozen body once, at send time. */
export function hashDocument(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

/** Default starter templates, one per shoot type (README Phase-1 exit). */
export const STARTER_TEMPLATES: { name: string; shootType: "wedding" | "newborn" | "family" | "commercial"; body: string }[] = [
  {
    name: "Wedding photography agreement",
    shootType: "wedding",
    body: `WEDDING PHOTOGRAPHY AGREEMENT\n\nThis agreement is between {{studio.name}} ("Photographer") and {{client.name}} & {{client.partnerName}} ("Clients") for photography services on {{session.date}} at {{session.location}}.\n\nRETAINER. A non-refundable retainer of {{invoice.deposit}} is due to reserve the date. The remaining balance of {{invoice.total}} is due 14 days before the event.\n\nDELIVERABLES. Edited images will be delivered via an online gallery within 8 weeks of the event.\n\nCANCELLATION. The retainer secures the date and is non-refundable. Balance payments made are refundable up to 60 days before the event.\n\nBy signing below, the Clients agree to these terms and consent to conduct this transaction electronically.`,
  },
  {
    name: "Newborn session agreement",
    shootType: "newborn",
    body: `NEWBORN SESSION AGREEMENT\n\nBetween {{studio.name}} ("Photographer") and {{client.name}} ("Client") for a newborn session, scheduled within the two-week window around the due date on {{session.date}}.\n\nRETAINER. {{invoice.deposit}} reserves your window; balance {{invoice.total}} due at the session.\n\nSAFETY. All posing follows newborn-safety best practices. The Client remains present throughout.\n\nDELIVERY. A proofing gallery is delivered within 7 days.\n\nBy signing, the Client agrees to these terms and consents to electronic signing.`,
  },
  {
    name: "Family / portrait session agreement",
    shootType: "family",
    body: `PORTRAIT SESSION AGREEMENT\n\nBetween {{studio.name}} ("Photographer") and {{client.name}} ("Client") for a session on {{session.date}} at {{session.location}}.\n\nPAYMENT. Session fee {{invoice.total}}, with {{invoice.deposit}} due to book.\n\nDELIVERY. An online proofing gallery is delivered within 2 weeks.\n\nBy signing, the Client agrees to these terms and consents to sign electronically.`,
  },
  {
    name: "Commercial photography agreement",
    shootType: "commercial",
    body: `COMMERCIAL PHOTOGRAPHY AGREEMENT\n\nBetween {{studio.name}} ("Photographer") and {{client.name}} ("Client") for a commercial shoot on {{session.date}}.\n\nFEE. {{invoice.total}}, net-30 from delivery. Deposit {{invoice.deposit}} due to book.\n\nUSAGE RIGHTS. Upon full payment, Client receives a non-exclusive, perpetual license to use delivered images for marketing and web. Photographer retains copyright and portfolio rights.\n\nBy signing, both parties agree to these terms and consent to sign electronically.`,
  },
];
