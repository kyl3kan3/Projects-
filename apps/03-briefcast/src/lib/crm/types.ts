/**
 * The CRM adapter interface. Every provider (HubSpot first, then Pipedrive/
 * Salesforce) implements this. The worker and sync layer only know this shape,
 * so adding a provider never touches pipeline code (README: "one adapter per
 * provider", differentiation #4: sync you can trust).
 */

export interface CrmContact {
  id: string;
  email: string;
  name: string | null;
  companyId: string | null;
}

export interface CrmDeal {
  id: string;
  name: string;
  stage: string | null;
  amountCents: number | null;
  closeDate: string | null;
  owner: string | null;
}

export interface FieldWrite {
  object: "contact" | "company" | "deal";
  targetId: string;
  property: string;
  value: string;
}

export interface CrmAdapter {
  provider: "hubspot" | "salesforce" | "pipedrive";
  /** Find a contact by email (attendee matching). */
  findContactByEmail(email: string): Promise<CrmContact | null>;
  /** Open deals associated with a contact. */
  dealsForContact(contactId: string): Promise<CrmDeal[]>;
  /** Log the meeting as an engagement/note on a target object. Idempotent by key. */
  logMeeting(opts: {
    targetObject: "contact" | "deal";
    targetId: string;
    title: string;
    body: string;
    occurredAt: Date;
    idempotencyKey: string;
  }): Promise<{ externalId: string }>;
  /** Create a task from an action item. Idempotent by key. */
  createTask(opts: {
    targetObject: "contact" | "deal";
    targetId: string;
    text: string;
    dueDate: string | null;
    idempotencyKey: string;
  }): Promise<{ externalId: string }>;
  /** Apply a single field write. Returns the prior value for the sync log. */
  updateField(write: FieldWrite): Promise<{ oldValue: string | null }>;
}
