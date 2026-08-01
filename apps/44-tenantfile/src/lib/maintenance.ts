/**
 * Maintenance requests with photo threads — the text-message workflow, formalised.
 *
 * The unread counters are per side rather than per message, because the thread has
 * exactly two participants and a landlord opening the thread on their phone should
 * clear their own dot without touching the tenant's.
 *
 * Rate limiting is deliberate and low: a tenant page is reachable by anyone
 * holding the link, so an unbounded thread is an unbounded upload target.
 */

import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  maintenanceRequests,
  properties,
  requestMessages,
  tenancies,
  units,
  type MaintenanceRequest,
  type Party,
  type RequestMessage,
  type RequestPriority,
  type RequestStatus,
} from "@/db/schema";
import { stitch } from "@/lib/file-events";
import { emailShell, notifier } from "@/lib/notify";
import { tenantPortalUrl } from "@/lib/links";
import { formatMoney, type IsoDate } from "@/lib/money";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";

/** Messages one party may post to one request in an hour. */
const MESSAGE_RATE_LIMIT = 20;
const MAX_PHOTOS_PER_MESSAGE = 6;

const TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  open: ["scheduled", "done", "closed"],
  scheduled: ["open", "done", "closed"],
  done: ["closed", "open"],
  closed: ["open"],
};

export function canTransitionRequest(from: RequestStatus, to: RequestStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function requestStatusLabel(status: RequestStatus): string {
  switch (status) {
    case "open":
      return "Open";
    case "scheduled":
      return "Scheduled";
    case "done":
      return "Done";
    case "closed":
      return "Closed";
  }
}

export function priorityLabel(priority: RequestPriority): string {
  switch (priority) {
    case "routine":
      return "Routine";
    case "urgent":
      return "Urgent";
    case "emergency":
      return "Emergency";
  }
}

/* ------------------------------------------------------------------ writes --- */

export interface OpenRequestInput {
  tenancyId: string;
  title: string;
  body: string;
  photoKeys: string[];
  openedBy: Party;
  priority?: RequestPriority;
}

export async function openRequest(input: OpenRequestInput): Promise<MaintenanceRequest> {
  const title = input.title.trim();
  if (title.length < 4) throw new Error("Give the request a short title, like 'Kitchen tap dripping'");
  if (input.body.trim().length < 4) throw new Error("Describe what is happening in a sentence or two");
  if (input.photoKeys.length > MAX_PHOTOS_PER_MESSAGE) {
    throw new Error(`Up to ${MAX_PHOTOS_PER_MESSAGE} photos at a time`);
  }

  const db = getDb();
  const [request] = await db
    .insert(maintenanceRequests)
    .values({
      tenancyId: input.tenancyId,
      title,
      priority: input.priority ?? "routine",
      openedBy: input.openedBy,
      status: "open",
      // The opening description is the thread's first message, not a column: the
      // thread is the record, and a request with a body plus messages would give
      // two places to look for what was said.
      landlordUnread: input.openedBy === "tenant" ? 1 : 0,
      tenantUnread: input.openedBy === "landlord" ? 1 : 0,
    })
    .returning();

  await db.insert(requestMessages).values({
    requestId: request.id,
    author: input.openedBy,
    body: input.body.trim(),
    photoKeys: input.photoKeys,
  });

  await stitch({
    tenancyId: input.tenancyId,
    kind: "request",
    refId: request.id,
    summary: `Repair request opened by the ${input.openedBy}: ${title}`,
    detail: input.photoKeys.length ? `${input.photoKeys.length} photo${input.photoKeys.length === 1 ? "" : "s"} attached` : "",
    dedupeKey: `request-open:${request.id}`,
  });

  await notifyOtherSide(request.id, input.openedBy, `New repair request: ${title}`, input.body.trim());
  return request;
}

export async function postMessage(
  requestId: string,
  author: Party,
  body: string,
  photoKeys: string[],
): Promise<RequestMessage> {
  if (body.trim().length === 0 && photoKeys.length === 0) throw new Error("Write something or attach a photo");
  if (photoKeys.length > MAX_PHOTOS_PER_MESSAGE) throw new Error(`Up to ${MAX_PHOTOS_PER_MESSAGE} photos at a time`);

  const db = getDb();
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await db
    .select({ id: requestMessages.id })
    .from(requestMessages)
    .where(and(eq(requestMessages.requestId, requestId), eq(requestMessages.author, author), gte(requestMessages.sentAt, hourAgo)));
  if (recent.length >= MESSAGE_RATE_LIMIT) {
    throw new Error("That is a lot of messages in an hour. Give it a few minutes.");
  }

  const [message] = await db
    .insert(requestMessages)
    .values({ requestId, author, body: body.trim(), photoKeys })
    .returning();

  await db
    .update(maintenanceRequests)
    .set({
      updatedAt: new Date(),
      landlordUnread: author === "tenant" ? sql`${maintenanceRequests.landlordUnread} + 1` : maintenanceRequests.landlordUnread,
      tenantUnread: author === "landlord" ? sql`${maintenanceRequests.tenantUnread} + 1` : maintenanceRequests.tenantUnread,
    })
    .where(eq(maintenanceRequests.id, requestId));

  const [request] = await db.select().from(maintenanceRequests).where(eq(maintenanceRequests.id, requestId));
  if (request) {
    await notifyOtherSide(requestId, author, `Repair update: ${request.title}`, body.trim());
  }
  return message;
}

export async function markThreadRead(requestId: string, reader: Party): Promise<void> {
  await getDb()
    .update(maintenanceRequests)
    .set(reader === "landlord" ? { landlordUnread: 0 } : { tenantUnread: 0 })
    .where(eq(maintenanceRequests.id, requestId));
}

export interface UpdateRequestInput {
  status?: RequestStatus;
  priority?: RequestPriority;
  scheduledFor?: IsoDate | null;
  costCents?: number | null;
}

export async function updateRequest(
  landlordId: string,
  requestId: string,
  input: UpdateRequestInput,
  actor: string,
): Promise<void> {
  const db = getDb();
  const owned = await landlordRequest(landlordId, requestId);
  if (!owned) throw new Error("No such request");
  const request = owned.request;

  if (input.status && input.status !== request.status && !canTransitionRequest(request.status, input.status)) {
    throw new Error(`A ${requestStatusLabel(request.status).toLowerCase()} request cannot move to ${requestStatusLabel(input.status).toLowerCase()}`);
  }
  if (input.costCents != null && (!Number.isInteger(input.costCents) || input.costCents < 0)) {
    throw new Error("Enter the cost as a number");
  }

  await db
    .update(maintenanceRequests)
    .set({
      status: input.status ?? request.status,
      priority: input.priority ?? request.priority,
      scheduledFor: input.scheduledFor === undefined ? request.scheduledFor : input.scheduledFor,
      costCents: input.costCents === undefined ? request.costCents : input.costCents,
      closedAt: input.status === "closed" ? new Date() : request.closedAt,
      updatedAt: new Date(),
    })
    .where(eq(maintenanceRequests.id, requestId));

  if (input.status && input.status !== request.status) {
    const cost = input.costCents ?? request.costCents;
    await stitch({
      tenancyId: request.tenancyId,
      kind: "request",
      refId: requestId,
      summary: `Repair "${request.title}" marked ${requestStatusLabel(input.status).toLowerCase()}`,
      detail:
        input.status === "scheduled" && (input.scheduledFor ?? request.scheduledFor)
          ? `Scheduled for ${input.scheduledFor ?? request.scheduledFor}`
          : cost != null && (input.status === "done" || input.status === "closed")
            ? `Cost ${formatMoney(cost)}`
            : "",
      amountCents: input.status === "done" || input.status === "closed" ? cost : null,
      dedupeKey: `request-${input.status}:${requestId}`,
    });
    await notifyOtherSide(
      requestId,
      "landlord",
      `Repair ${requestStatusLabel(input.status).toLowerCase()}: ${request.title}`,
      input.status === "scheduled" && (input.scheduledFor ?? request.scheduledFor)
        ? `Someone is coming on ${input.scheduledFor ?? request.scheduledFor}.`
        : `Marked ${requestStatusLabel(input.status).toLowerCase()}.`,
    );
  }

  await audit(landlordId, actor, "request.update", requestId, { ...input });
}

/* ------------------------------------------------------------------ reads --- */

export async function threadFor(requestId: string): Promise<RequestMessage[]> {
  return getDb()
    .select()
    .from(requestMessages)
    .where(eq(requestMessages.requestId, requestId))
    .orderBy(asc(requestMessages.sentAt));
}

export async function requestsForTenancy(tenancyId: string): Promise<MaintenanceRequest[]> {
  return getDb()
    .select()
    .from(maintenanceRequests)
    .where(eq(maintenanceRequests.tenancyId, tenancyId))
    .orderBy(desc(maintenanceRequests.updatedAt));
}

export interface OwnedRequest {
  request: MaintenanceRequest;
  tenancy: typeof tenancies.$inferSelect;
  unitLabel: string;
  address: string;
}

export async function landlordRequest(landlordId: string, requestId: string): Promise<OwnedRequest | null> {
  const db = getDb();
  const [row] = await db
    .select({ request: maintenanceRequests, tenancy: tenancies, unit: units, property: properties })
    .from(maintenanceRequests)
    .innerJoin(tenancies, eq(tenancies.id, maintenanceRequests.tenancyId))
    .innerJoin(units, eq(units.id, tenancies.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(and(eq(maintenanceRequests.id, requestId), eq(properties.landlordId, landlordId)));
  if (!row) return null;
  return { request: row.request, tenancy: row.tenancy, unitLabel: row.unit.label, address: row.property.address };
}

export async function landlordRequests(landlordId: string) {
  const db = getDb();
  return db
    .select({ request: maintenanceRequests, tenancy: tenancies, unit: units, property: properties })
    .from(maintenanceRequests)
    .innerJoin(tenancies, eq(tenancies.id, maintenanceRequests.tenancyId))
    .innerJoin(units, eq(units.id, tenancies.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(eq(properties.landlordId, landlordId))
    .orderBy(desc(maintenanceRequests.updatedAt));
}

/** Spend per unit, for the maintenance history rollup on a unit page. */
export async function costByUnit(landlordId: string) {
  const rows = await getDb().execute<{ unit_id: string; label: string; address: string; total: string; n: string }>(sql`
    select u.id as unit_id, u.label, p.address,
           coalesce(sum(r.cost_cents), 0) as total,
           count(r.id) as n
    from maintenance_requests r
    join tenancies t on t.id = r.tenancy_id
    join units u on u.id = t.unit_id
    join properties p on p.id = u.property_id
    where p.landlord_id = ${landlordId}
    group by u.id, u.label, p.address
    order by total desc
  `);
  return [...rows].map((r) => ({
    unitId: r.unit_id,
    label: r.label,
    address: r.address,
    totalCents: Number(r.total),
    requests: Number(r.n),
  }));
}

/* --------------------------------------------------------- notifications --- */

/**
 * Tell the other party. SMS first for tenants (they live in texts, per README),
 * email for landlords. Failing to notify never fails the message itself — the
 * thread is the record; the ping is a convenience.
 */
async function notifyOtherSide(requestId: string, author: Party, subject: string, body: string): Promise<void> {
  try {
    const db = getDb();
    const [row] = await db
      .select({ request: maintenanceRequests, tenancy: tenancies, unit: units, property: properties })
      .from(maintenanceRequests)
      .innerJoin(tenancies, eq(tenancies.id, maintenanceRequests.tenancyId))
      .innerJoin(units, eq(units.id, tenancies.unitId))
      .innerJoin(properties, eq(properties.id, units.propertyId))
      .where(eq(maintenanceRequests.id, requestId));
    if (!row) return;

    const where = `${row.property.address} ${row.unit.label}`;

    if (author === "tenant") {
      const [owner] = await db.execute<{ email: string }>(sql`
        select email from users where landlord_id = ${row.property.landlordId} order by created_at asc limit 1
      `);
      if (owner?.email) {
        const shell = emailShell(subject, [`${where}`, body], {
          label: "Open the thread",
          url: `${env.appUrl}/requests/${requestId}`,
        });
        await notifier().email({ to: owner.email, subject: `${subject} — ${where}`, text: shell.text, html: shell.html });
      }
      return;
    }

    const phone = row.tenancy.tenantPhones[0];
    const email = row.tenancy.tenantEmails[0];
    const url = tenantPortalUrl(row.tenancy.portalToken);
    if (phone) {
      await notifier().sms({ to: phone, body: `${where}: ${body.slice(0, 100)} — ${url}` });
      return;
    }
    if (email) {
      const shell = emailShell(subject, [where, body], { label: "Open the thread", url });
      await notifier().email({ to: email, subject, text: shell.text, html: shell.html });
    }
  } catch (err) {
    console.error("[maintenance] could not notify the other side", { requestId, err });
  }
}
