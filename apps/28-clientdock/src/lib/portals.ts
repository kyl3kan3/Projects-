/**
 * Agency-side portal management: clients, contacts, portals, module toggles,
 * templates and duplication, timeline phases and quick links.
 *
 * The rule that mirrors the portal side: every read and write here is scoped by
 * `workspaceId`, taken from the agency session. `requireOwnedPortal` is the one
 * door — it resolves a portal id *within* a workspace and throws otherwise, so an
 * agency cannot touch another agency's portal by pasting its id into a form.
 */

import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  approvals,
  clients,
  contacts,
  files,
  invoices,
  messages,
  portalLinks,
  portalViews,
  portals,
  threads,
  timelinePhases,
  MODULE_IDS,
  type Client,
  type Contact,
  type ModuleId,
  type Portal,
  type PortalLink,
  type PlanId,
  type TimelinePhase,
} from "@/db/schema";
import { clampPct, slugify } from "@/lib/format";
import { isUuid, touchPortal } from "@/lib/files";
import { canCreatePortal, moduleAllowed, portalLimitMessage } from "@/lib/plans";

export class PortalError extends Error {}

/* --------------------------------------------------------------- clients --- */

export async function listClients(workspaceId: string): Promise<Client[]> {
  const db = getDb();
  return db
    .select()
    .from(clients)
    .where(eq(clients.workspaceId, workspaceId))
    .orderBy(asc(clients.company));
}

export async function createClient(input: {
  workspaceId: string;
  company: string;
  contactName?: string;
  contactEmail?: string;
}): Promise<{ client: Client; contact: Contact | null }> {
  const company = input.company.trim();
  if (!company) throw new PortalError("The client needs a company name");

  const db = getDb();
  const [client] = await db
    .insert(clients)
    .values({ workspaceId: input.workspaceId, company: company.slice(0, 120) })
    .returning();

  let contact: Contact | null = null;
  if (input.contactEmail?.trim()) {
    contact = await addContact({
      workspaceId: input.workspaceId,
      clientId: client.id,
      name: input.contactName ?? "",
      email: input.contactEmail,
    });
  }
  return { client, contact };
}

export async function addContact(input: {
  workspaceId: string;
  clientId: string;
  name: string;
  email: string;
}): Promise<Contact> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new PortalError("Enter a valid email address");
  if (!isUuid(input.clientId)) throw new PortalError("That client no longer exists");

  const db = getDb();
  // Scoped: the client must belong to this workspace.
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, input.clientId), eq(clients.workspaceId, input.workspaceId)));
  if (!client) throw new PortalError("That client isn't in your workspace");

  const existing = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.clientId, client.id), eq(contacts.email, email)));
  if (existing[0]) return existing[0];

  const [row] = await db
    .insert(contacts)
    .values({
      clientId: client.id,
      workspaceId: input.workspaceId,
      name: input.name.trim().slice(0, 120) || email.split("@")[0],
      email,
    })
    .returning();
  return row;
}

export async function listContacts(workspaceId: string, clientId: string): Promise<Contact[]> {
  if (!isUuid(clientId)) return [];
  const db = getDb();
  return db
    .select()
    .from(contacts)
    .where(and(eq(contacts.clientId, clientId), eq(contacts.workspaceId, workspaceId)))
    .orderBy(asc(contacts.createdAt));
}

/* --------------------------------------------------------------- portals --- */

async function uniqueSlug(base: string): Promise<string> {
  const db = getDb();
  const root = slugify(base, "portal");
  for (let attempt = 0; attempt < 20; attempt++) {
    const slug = attempt === 0 ? root : `${root}-${randomBytes(2).toString("hex")}`;
    const [clash] = await db.select().from(portals).where(eq(portals.slug, slug));
    if (!clash) return slug;
  }
  return `${root}-${randomBytes(4).toString("hex")}`;
}

/** Modules a new portal gets when the agency doesn't choose: the useful four. */
export const DEFAULT_MODULES: ModuleId[] = ["timeline", "files", "approvals", "messages"];

export function sanitizeModules(planId: PlanId, requested: string[]): ModuleId[] {
  const wanted = new Set(requested);
  return MODULE_IDS.filter((id) => wanted.has(id) && moduleAllowed(planId, id));
}

export async function countClientPortals(workspaceId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(portals)
    .where(and(eq(portals.workspaceId, workspaceId), eq(portals.isTemplate, false)));
  return Number(row?.n ?? 0);
}

export interface CreatePortalInput {
  workspaceId: string;
  planId: PlanId;
  clientId: string;
  title?: string;
  preparedBy: string;
  welcomeNote?: string | null;
  modules?: string[];
  /** Copy modules, timeline and links from this template or portal. */
  duplicateFromPortalId?: string | null;
}

export async function createPortal(input: CreatePortalInput): Promise<Portal> {
  const db = getDb();

  if (!canCreatePortal(input.planId, await countClientPortals(input.workspaceId))) {
    throw new PortalError(portalLimitMessage(input.planId));
  }

  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, input.clientId), eq(clients.workspaceId, input.workspaceId)));
  if (!client) throw new PortalError("Pick a client for this portal");

  let modules = sanitizeModules(input.planId, input.modules ?? DEFAULT_MODULES);
  let source: Portal | null = null;
  if (input.duplicateFromPortalId) {
    source = await requireOwnedPortal(input.workspaceId, input.duplicateFromPortalId);
    modules = sanitizeModules(input.planId, source.enabledModules as unknown as string[]);
  }
  if (modules.length === 0) modules = sanitizeModules(input.planId, DEFAULT_MODULES);

  const title = input.title?.trim() || client.company;
  const [portal] = await db
    .insert(portals)
    .values({
      workspaceId: input.workspaceId,
      clientId: client.id,
      slug: await uniqueSlug(`${client.company}`),
      title,
      preparedBy: input.preparedBy.trim().slice(0, 120),
      welcomeNote: input.welcomeNote?.trim() || source?.welcomeNote || null,
      enabledModules: modules,
      status: "draft",
    })
    .returning();

  if (source) await copyScaffolding(source.id, portal.id);
  return portal;
}

/**
 * Copy the *structure* of a portal — phases and links — never its content.
 * Duplicating a template must not move one client's files, approvals, messages or
 * invoices into another client's portal; that would be the exact leak this whole
 * app is built to prevent.
 */
async function copyScaffolding(fromPortalId: string, toPortalId: string): Promise<void> {
  const db = getDb();
  const phases = await db
    .select()
    .from(timelinePhases)
    .where(eq(timelinePhases.portalId, fromPortalId))
    .orderBy(asc(timelinePhases.position));
  if (phases.length) {
    await db.insert(timelinePhases).values(
      phases.map((p) => ({
        portalId: toPortalId,
        name: p.name,
        position: p.position,
        // Progress is per-engagement; a duplicate starts at zero, not mid-project.
        progressPct: 0,
        note: p.note,
      })),
    );
  }

  const links = await db
    .select()
    .from(portalLinks)
    .where(eq(portalLinks.portalId, fromPortalId))
    .orderBy(asc(portalLinks.position));
  if (links.length) {
    await db.insert(portalLinks).values(
      links.map((l) => ({
        portalId: toPortalId,
        label: l.label,
        url: l.url,
        position: l.position,
      })),
    );
  }
}

/** Save an existing portal's structure as a reusable template. */
export async function saveAsTemplate(
  workspaceId: string,
  portalId: string,
  templateName: string,
): Promise<Portal> {
  const source = await requireOwnedPortal(workspaceId, portalId);
  const name = templateName.trim() || `${source.title} setup`;
  const db = getDb();
  const [template] = await db
    .insert(portals)
    .values({
      workspaceId,
      clientId: null,
      slug: await uniqueSlug(`tpl-${name}`),
      title: name,
      preparedBy: source.preparedBy,
      welcomeNote: source.welcomeNote,
      enabledModules: source.enabledModules,
      status: "draft",
      isTemplate: true,
      templateName: name.slice(0, 120),
    })
    .returning();
  await copyScaffolding(source.id, template.id);
  return template;
}

export async function listTemplates(workspaceId: string): Promise<Portal[]> {
  const db = getDb();
  return db
    .select()
    .from(portals)
    .where(and(eq(portals.workspaceId, workspaceId), eq(portals.isTemplate, true)))
    .orderBy(asc(portals.createdAt));
}

/**
 * The one door for agency-side portal access. Resolves a portal *inside* a
 * workspace, or throws. Nothing else in the agency code path may select a portal
 * by id alone.
 */
export async function requireOwnedPortal(workspaceId: string, portalId: string): Promise<Portal> {
  if (!isUuid(portalId)) throw new PortalError("That portal no longer exists");
  const db = getDb();
  const [portal] = await db
    .select()
    .from(portals)
    .where(and(eq(portals.id, portalId), eq(portals.workspaceId, workspaceId)));
  if (!portal) throw new PortalError("That portal isn't in your workspace");
  return portal;
}

export async function findOwnedPortal(
  workspaceId: string,
  portalId: string,
): Promise<Portal | null> {
  try {
    return await requireOwnedPortal(workspaceId, portalId);
  } catch {
    return null;
  }
}

export async function listPortals(workspaceId: string): Promise<Portal[]> {
  const db = getDb();
  return db
    .select()
    .from(portals)
    .where(and(eq(portals.workspaceId, workspaceId), eq(portals.isTemplate, false)))
    .orderBy(desc(portals.lastUpdatedAt));
}

export async function setModules(
  workspaceId: string,
  portalId: string,
  planId: PlanId,
  requested: string[],
): Promise<Portal> {
  await requireOwnedPortal(workspaceId, portalId);
  const db = getDb();
  const [row] = await db
    .update(portals)
    .set({ enabledModules: sanitizeModules(planId, requested), lastUpdatedAt: new Date() })
    .where(and(eq(portals.id, portalId), eq(portals.workspaceId, workspaceId)))
    .returning();
  return row;
}

export async function updatePortalDetails(
  workspaceId: string,
  portalId: string,
  patch: { title?: string; preparedBy?: string; welcomeNote?: string | null },
): Promise<Portal> {
  await requireOwnedPortal(workspaceId, portalId);
  const db = getDb();
  const set: Record<string, unknown> = { lastUpdatedAt: new Date() };
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) throw new PortalError("The portal needs a title");
    set.title = title.slice(0, 120);
  }
  if (patch.preparedBy !== undefined) set.preparedBy = patch.preparedBy.trim().slice(0, 120);
  if (patch.welcomeNote !== undefined) set.welcomeNote = patch.welcomeNote?.trim() || null;

  const [row] = await db
    .update(portals)
    .set(set)
    .where(and(eq(portals.id, portalId), eq(portals.workspaceId, workspaceId)))
    .returning();
  return row;
}

export async function setPortalStatus(
  workspaceId: string,
  portalId: string,
  status: Portal["status"],
): Promise<Portal> {
  await requireOwnedPortal(workspaceId, portalId);
  const db = getDb();
  const [row] = await db
    .update(portals)
    .set({ status, lastUpdatedAt: new Date() })
    .where(and(eq(portals.id, portalId), eq(portals.workspaceId, workspaceId)))
    .returning();
  return row;
}

/* -------------------------------------------------------------- timeline --- */

export async function listPhases(portalId: string): Promise<TimelinePhase[]> {
  const db = getDb();
  return db
    .select()
    .from(timelinePhases)
    .where(eq(timelinePhases.portalId, portalId))
    .orderBy(asc(timelinePhases.position));
}

export async function addPhase(input: {
  portalId: string;
  name: string;
  progressPct?: number;
  note?: string | null;
}): Promise<TimelinePhase> {
  const name = input.name.trim();
  if (!name) throw new PortalError("Give the phase a name");
  const db = getDb();
  const [{ max } = { max: -1 }] = await db
    .select({ max: sql<number>`coalesce(max(${timelinePhases.position}), -1)` })
    .from(timelinePhases)
    .where(eq(timelinePhases.portalId, input.portalId));
  const [row] = await db
    .insert(timelinePhases)
    .values({
      portalId: input.portalId,
      name: name.slice(0, 120),
      position: Number(max) + 1,
      progressPct: clampPct(input.progressPct ?? 0),
      note: input.note?.trim() || null,
    })
    .returning();
  await touchPortal(input.portalId);
  return row;
}

/**
 * Move a phase's progress. Scoped by portal id: a phase id belonging to another
 * portal updates nothing and returns null.
 */
export async function setPhaseProgress(
  portalId: string,
  phaseId: string,
  progressPct: number,
  note?: string | null,
): Promise<TimelinePhase | null> {
  if (!isUuid(phaseId)) return null;
  const db = getDb();
  const set: Record<string, unknown> = { progressPct: clampPct(progressPct), updatedAt: new Date() };
  if (note !== undefined) set.note = note?.trim() || null;
  const [row] = await db
    .update(timelinePhases)
    .set(set)
    .where(and(eq(timelinePhases.id, phaseId), eq(timelinePhases.portalId, portalId)))
    .returning();
  if (row) await touchPortal(portalId);
  return row ?? null;
}

export async function deletePhase(portalId: string, phaseId: string): Promise<boolean> {
  if (!isUuid(phaseId)) return false;
  const db = getDb();
  const rows = await db
    .delete(timelinePhases)
    .where(and(eq(timelinePhases.id, phaseId), eq(timelinePhases.portalId, portalId)))
    .returning({ id: timelinePhases.id });
  if (rows.length) await touchPortal(portalId);
  return rows.length > 0;
}

/* ----------------------------------------------------------------- links --- */

export async function listLinks(portalId: string): Promise<PortalLink[]> {
  const db = getDb();
  return db
    .select()
    .from(portalLinks)
    .where(eq(portalLinks.portalId, portalId))
    .orderBy(asc(portalLinks.position));
}

export async function addLink(input: {
  portalId: string;
  label: string;
  url: string;
}): Promise<PortalLink> {
  const label = input.label.trim();
  const url = input.url.trim();
  if (!label) throw new PortalError("Give the link a label");
  if (!/^https:\/\/[^\s]+$/i.test(url)) throw new PortalError("Links have to be https:// URLs");
  const db = getDb();
  const [{ max } = { max: -1 }] = await db
    .select({ max: sql<number>`coalesce(max(${portalLinks.position}), -1)` })
    .from(portalLinks)
    .where(eq(portalLinks.portalId, input.portalId));
  const [row] = await db
    .insert(portalLinks)
    .values({
      portalId: input.portalId,
      label: label.slice(0, 80),
      url: url.slice(0, 500),
      position: Number(max) + 1,
    })
    .returning();
  await touchPortal(input.portalId);
  return row;
}

export async function deleteLink(portalId: string, linkId: string): Promise<boolean> {
  if (!isUuid(linkId)) return false;
  const db = getDb();
  const rows = await db
    .delete(portalLinks)
    .where(and(eq(portalLinks.id, linkId), eq(portalLinks.portalId, portalId)))
    .returning({ id: portalLinks.id });
  return rows.length > 0;
}

/* ------------------------------------------------------- agency overviews --- */

export interface PortalSummary {
  portal: Portal;
  client: Client | null;
  pendingApprovals: number;
  openInvoiceCents: number;
  unansweredClientMessages: number;
  fileCount: number;
  /** Views per day for the last 14 days, oldest first — the 48x16 sparkline. */
  viewSeries: number[];
  contactCount: number;
}

const SPARK_DAYS = 14;

/** Everything the dashboard wall needs, in a bounded number of queries. */
export async function loadPortalSummaries(workspaceId: string): Promise<PortalSummary[]> {
  const db = getDb();
  const portalRows = await listPortals(workspaceId);
  if (portalRows.length === 0) return [];
  const ids = portalRows.map((p) => p.id);

  const clientRows = await db.select().from(clients).where(eq(clients.workspaceId, workspaceId));
  const contactRows = await db.select().from(contacts).where(eq(contacts.workspaceId, workspaceId));

  const pending = await db
    .select({ portalId: approvals.portalId, n: sql<number>`count(*)` })
    .from(approvals)
    .where(and(inArray(approvals.portalId, ids), eq(approvals.status, "pending")))
    .groupBy(approvals.portalId);

  const openMoney = await db
    .select({ portalId: invoices.portalId, cents: sql<number>`sum(${invoices.amountCents})` })
    .from(invoices)
    .where(and(inArray(invoices.portalId, ids), eq(invoices.status, "open")))
    .groupBy(invoices.portalId);

  const fileCounts = await db
    .select({ portalId: files.portalId, n: sql<number>`count(*)` })
    .from(files)
    .where(inArray(files.portalId, ids))
    .groupBy(files.portalId);

  const threadRows = await db.select().from(threads).where(inArray(threads.portalId, ids));
  const messageRows = threadRows.length
    ? await db
        .select()
        .from(messages)
        .where(inArray(messages.portalId, ids))
        .orderBy(asc(messages.createdAt))
    : [];

  const since = new Date(Date.now() - (SPARK_DAYS - 1) * 86_400_000);
  const viewRows = await db
    .select()
    .from(portalViews)
    .where(and(inArray(portalViews.portalId, ids), gte(portalViews.day, since)));

  const dayKeys: string[] = [];
  for (let i = SPARK_DAYS - 1; i >= 0; i--) {
    dayKeys.push(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10));
  }

  return portalRows.map((portal) => {
    const lastByThread = new Map<string, (typeof messageRows)[number]>();
    for (const m of messageRows) {
      if (m.portalId !== portal.id) continue;
      lastByThread.set(m.threadId, m);
    }
    const viewsByDay = new Map<string, number>();
    for (const v of viewRows) {
      if (v.portalId !== portal.id) continue;
      const key = v.day.toISOString().slice(0, 10);
      viewsByDay.set(key, (viewsByDay.get(key) ?? 0) + v.views);
    }

    return {
      portal,
      client: clientRows.find((c) => c.id === portal.clientId) ?? null,
      pendingApprovals: Number(pending.find((p) => p.portalId === portal.id)?.n ?? 0),
      openInvoiceCents: Number(openMoney.find((m) => m.portalId === portal.id)?.cents ?? 0),
      unansweredClientMessages: [...lastByThread.values()].filter((m) => m.authorKind === "client")
        .length,
      fileCount: Number(fileCounts.find((f) => f.portalId === portal.id)?.n ?? 0),
      viewSeries: dayKeys.map((k) => viewsByDay.get(k) ?? 0),
      contactCount: contactRows.filter((c) => c.clientId === portal.clientId).length,
    };
  });
}

export interface AttentionItem {
  portalId: string;
  portalSlug: string;
  clientName: string;
  kind: "approval" | "message" | "stale" | "invoice" | "uninvited";
  headline: string;
  detail: string;
  since: Date;
}

/**
 * The "Needs attention" queue — the first thing on the agency dashboard, because
 * it is the only screen that makes the agency money or saves the relationship.
 */
export async function loadAttentionQueue(
  workspaceId: string,
  summaries?: PortalSummary[],
): Promise<AttentionItem[]> {
  const db = getDb();
  const rows = summaries ?? (await loadPortalSummaries(workspaceId));
  const active = rows.filter((s) => s.portal.status !== "archived");
  if (active.length === 0) return [];
  const ids = active.map((s) => s.portal.id);

  const pendingApprovals = await db
    .select()
    .from(approvals)
    .where(and(inArray(approvals.portalId, ids), eq(approvals.status, "pending")))
    .orderBy(asc(approvals.createdAt));

  const clientMessages = await db
    .select()
    .from(messages)
    .where(and(inArray(messages.portalId, ids), eq(messages.authorKind, "client")))
    .orderBy(desc(messages.createdAt));

  const items: AttentionItem[] = [];
  const byId = new Map(active.map((s) => [s.portal.id, s]));

  for (const a of pendingApprovals) {
    const s = byId.get(a.portalId);
    if (!s) continue;
    items.push({
      portalId: a.portalId,
      portalSlug: s.portal.slug,
      clientName: s.client?.company ?? s.portal.title,
      kind: "approval",
      headline: `${s.client?.company ?? s.portal.title} — approval waiting`,
      detail: a.title,
      since: a.createdAt,
    });
  }

  const seenThreads = new Set<string>();
  for (const m of clientMessages) {
    if (seenThreads.has(m.threadId)) continue;
    seenThreads.add(m.threadId);
    const s = byId.get(m.portalId);
    if (!s) continue;
    items.push({
      portalId: m.portalId,
      portalSlug: s.portal.slug,
      clientName: s.client?.company ?? s.portal.title,
      kind: "message",
      headline: `${s.client?.company ?? s.portal.title} — replied`,
      detail: m.body.slice(0, 90),
      since: m.createdAt,
    });
  }

  const staleCutoff = Date.now() - 7 * 86_400_000;
  for (const s of active) {
    if (s.portal.status === "active" && s.portal.lastUpdatedAt.getTime() < staleCutoff) {
      items.push({
        portalId: s.portal.id,
        portalSlug: s.portal.slug,
        clientName: s.client?.company ?? s.portal.title,
        kind: "stale",
        headline: `${s.client?.company ?? s.portal.title} — no update in a week`,
        detail: "Post something before they email you",
        since: s.portal.lastUpdatedAt,
      });
    }
    if (s.portal.status === "draft" && s.contactCount === 0) {
      items.push({
        portalId: s.portal.id,
        portalSlug: s.portal.slug,
        clientName: s.client?.company ?? s.portal.title,
        kind: "uninvited",
        headline: `${s.client?.company ?? s.portal.title} — nobody invited yet`,
        detail: "A portal with no contact is a portal nobody opens",
        since: s.portal.createdAt,
      });
    }
  }

  // Oldest grievance first: the thing that has been waiting longest is the thing
  // most likely to cost the relationship.
  return items.sort((a, b) => a.since.getTime() - b.since.getTime());
}
