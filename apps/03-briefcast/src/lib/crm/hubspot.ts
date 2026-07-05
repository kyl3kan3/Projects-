/**
 * HubSpot adapter — the launch CRM. Every write is idempotent (external ids +
 * operation keys), records old/new, and is individually retryable. Token
 * refresh handled per call; a 401 flips the connection status upstream.
 */

import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { decryptToken, encryptToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import type { CrmAdapter, CrmContact, CrmDeal, FieldWrite } from "@/lib/crm/types";

const API = "https://api.hubapi.com";

async function refreshAccessToken(connectionId: string): Promise<string> {
  const conn = await db.query.crmConnections.findFirst({
    where: eq(schema.crmConnections.id, connectionId),
  });
  if (!conn?.refreshTokenEnc) throw new Error("No HubSpot refresh token");
  const res = await fetch(`${API}/oauth/v1/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: env.hubspotClientId,
      client_secret: env.hubspotClientSecret,
      refresh_token: decryptToken(conn.refreshTokenEnc),
    }),
  });
  if (!res.ok) throw new Error(`HubSpot token refresh ${res.status}`);
  const data = (await res.json()) as { access_token: string };
  await db
    .update(schema.crmConnections)
    .set({ accessTokenEnc: encryptToken(data.access_token) })
    .where(eq(schema.crmConnections.id, connectionId));
  return data.access_token;
}

export function hubspotAdapter(connectionId: string, accessTokenEnc: string): CrmAdapter {
  let token = decryptToken(accessTokenEnc);

  async function call<T>(path: string, init?: RequestInit, retry = true): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (res.status === 401 && retry) {
      token = await refreshAccessToken(connectionId);
      return call<T>(path, init, false);
    }
    if (!res.ok) throw new Error(`HubSpot ${path} ${res.status}: ${await res.text()}`);
    return (res.status === 204 ? (null as T) : res.json()) as Promise<T>;
  }

  return {
    provider: "hubspot",

    async findContactByEmail(email) {
      const data = await call<{ results: { id: string; properties: Record<string, string>; associations?: { companies?: { results: { id: string }[] } } }[] }>(
        `/crm/v3/objects/contacts/search`,
        {
          method: "POST",
          body: JSON.stringify({
            filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
            properties: ["email", "firstname", "lastname"],
            associations: ["companies"],
            limit: 1,
          }),
        },
      );
      const r = data.results?.[0];
      if (!r) return null;
      const name = [r.properties.firstname, r.properties.lastname].filter(Boolean).join(" ") || null;
      return { id: r.id, email, name, companyId: r.associations?.companies?.results?.[0]?.id ?? null } satisfies CrmContact;
    },

    async dealsForContact(contactId) {
      const assoc = await call<{ results: { toObjectId: string }[] }>(
        `/crm/v4/objects/contacts/${contactId}/associations/deals`,
      );
      const deals: CrmDeal[] = [];
      for (const a of assoc.results ?? []) {
        const d = await call<{ id: string; properties: Record<string, string> }>(
          `/crm/v3/objects/deals/${a.toObjectId}?properties=dealname,dealstage,amount,closedate,hubspot_owner_id`,
        );
        deals.push({
          id: d.id,
          name: d.properties.dealname ?? "Untitled deal",
          stage: d.properties.dealstage ?? null,
          amountCents: d.properties.amount ? Math.round(Number(d.properties.amount) * 100) : null,
          closeDate: d.properties.closedate ?? null,
          owner: d.properties.hubspot_owner_id ?? null,
        });
      }
      return deals;
    },

    async logMeeting(opts) {
      const created = await call<{ id: string }>(`/crm/v3/objects/meetings`, {
        method: "POST",
        body: JSON.stringify({
          properties: {
            hs_meeting_title: opts.title,
            hs_meeting_body: opts.body,
            hs_timestamp: opts.occurredAt.toISOString(),
            hs_meeting_outcome: "COMPLETED",
          },
          associations: [
            {
              to: { id: opts.targetId },
              types: [
                {
                  associationCategory: "HUBSPOT_DEFINED",
                  associationTypeId: opts.targetObject === "deal" ? 212 : 200,
                },
              ],
            },
          ],
        }),
      });
      return { externalId: created.id };
    },

    async createTask(opts) {
      const created = await call<{ id: string }>(`/crm/v3/objects/tasks`, {
        method: "POST",
        body: JSON.stringify({
          properties: {
            hs_task_subject: opts.text,
            hs_task_status: "NOT_STARTED",
            hs_timestamp: opts.dueDate ? new Date(opts.dueDate).toISOString() : new Date().toISOString(),
          },
          associations: [
            {
              to: { id: opts.targetId },
              types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: opts.targetObject === "deal" ? 216 : 204 }],
            },
          ],
        }),
      });
      return { externalId: created.id };
    },

    async updateField(write: FieldWrite) {
      const path = `/crm/v3/objects/${write.object === "deal" ? "deals" : write.object === "company" ? "companies" : "contacts"}/${write.targetId}`;
      const before = await call<{ properties: Record<string, string> }>(`${path}?properties=${write.property}`);
      const oldValue = before.properties?.[write.property] ?? null;
      await call(path, { method: "PATCH", body: JSON.stringify({ properties: { [write.property]: write.value } }) });
      return { oldValue };
    },
  };
}

export function hubspotAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.hubspotClientId,
    redirect_uri: `${env.appUrl}/api/crm/hubspot/callback`,
    scope: "crm.objects.contacts.read crm.objects.deals.read crm.objects.deals.write crm.objects.contacts.write crm.schemas.deals.read",
    state,
  });
  return `https://app.hubspot.com/oauth/authorize?${params}`;
}
