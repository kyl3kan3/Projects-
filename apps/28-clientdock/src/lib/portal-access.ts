/**
 * The client-portal read boundary. **This is the file to read if you read one.**
 *
 * A portal must never leak another client's data. The invariant, enforced here so
 * no page has to remember it:
 *
 *  1. A page resolves a *shell* from the slug — the portal row plus the agency's
 *     branding. That is public information: the client's company name and the
 *     agency's logo, nothing a competitor could not read off an invoice.
 *  2. A viewer is then resolved from a **signed** source: either a portal-session
 *     cookie whose `portalId` claim matches the shell, or an agency session whose
 *     workspace owns the portal (view-as preview).
 *  3. Everything after that reads `viewer.portalId` — a value that came out of a
 *     signature check, never out of the URL. `loadPortalView` and the scoped
 *     getters take a viewer, not an id, so a page cannot accidentally pass a
 *     request parameter where the authorised id belongs.
 *  4. Ids inside the portal (a file id, an approval id, a thread id) are always
 *     resolved as `(id, portalId)` pairs. A pasted id from another portal
 *     resolves to null, not to somebody else's deliverable.
 */

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clients,
  contacts,
  portals,
  portalViews,
  workspaces,
  type Client,
  type Contact,
  type Invoice,
  type ModuleId,
  type Portal,
  type PortalLink,
  type TimelinePhase,
  type Workspace,
} from "@/db/schema";
import { getPortalSession, logPortalView } from "@/lib/magic-auth";
import { currentContext } from "@/lib/auth";
import { listApprovals, type ApprovalWithFile } from "@/lib/approvals";
import { listFileStacks, type FileStack } from "@/lib/files";
import { listInvoices } from "@/lib/invoices";
import { listThreads, type ThreadWithMessages } from "@/lib/messages";
import { listLinks, listPhases } from "@/lib/portals";
import { showsClientDockBadge } from "@/lib/plans";
import { overallProgress } from "@/lib/format";

/** Public-safe identity of a portal: enough to render the door, nothing behind it. */
export interface PortalShell {
  portal: Portal;
  workspace: Workspace;
  client: Client | null;
}

export type ViewerMode = "client" | "preview";

export interface PortalViewer extends PortalShell {
  mode: ViewerMode;
  /** The authoritative portal id: from a signature, never from the request. */
  portalId: string;
  /** Null in preview mode — the agency is not a contact. */
  contact: Contact | null;
  /** Preview mode is read-only; every mutation checks this. */
  readOnly: boolean;
  showBadge: boolean;
}

export class PortalAccessError extends Error {}

/** Resolve the portal a slug names, or null. Archived portals are closed doors. */
export async function loadPortalShell(slug: string): Promise<PortalShell | null> {
  if (!slug || slug.length > 60) return null;
  const db = getDb();
  const [portal] = await db.select().from(portals).where(eq(portals.slug, slug));
  if (!portal) return null;
  // Templates are agency scaffolding and have no client — they are never served.
  if (portal.isTemplate) return null;

  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, portal.workspaceId));
  if (!workspace) return null;

  const client = portal.clientId
    ? ((await db.select().from(clients).where(eq(clients.id, portal.clientId)))[0] ?? null)
    : null;

  return { portal, workspace, client };
}

export type ViewerResolution =
  | { kind: "not-found" }
  | { kind: "needs-access"; shell: PortalShell }
  | { kind: "closed"; shell: PortalShell }
  | { kind: "viewer"; viewer: PortalViewer };

/**
 * Who is looking at this portal?
 *
 * Order matters. A portal session wins over an agency session, so an agency owner
 * who redeems a real magic link sees exactly what the client sees — otherwise
 * "view as" would be the only way to test and the real path would go unexercised.
 */
export async function resolveViewer(slug: string): Promise<ViewerResolution> {
  const shell = await loadPortalShell(slug);
  if (!shell) return { kind: "not-found" };

  const session = await getPortalSession(shell.portal.id);
  if (session) {
    const db = getDb();
    const [contact] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, session.contactId));

    // The contact must still belong to the client this portal is for. Removing a
    // client's contact therefore ends their access on the next request, without a
    // token sweep — the cookie alone is never enough.
    const stillValid =
      contact &&
      shell.portal.clientId &&
      contact.clientId === shell.portal.clientId &&
      contact.workspaceId === shell.portal.workspaceId;

    if (stillValid) {
      if (shell.portal.status === "archived") return { kind: "closed", shell };
      return {
        kind: "viewer",
        viewer: {
          ...shell,
          mode: "client",
          portalId: session.portalId,
          contact,
          readOnly: false,
          showBadge: showsClientDockBadge(shell.workspace.plan),
        },
      };
    }
  }

  // View-as preview: an agency member whose workspace owns this portal.
  const agency = await currentContext();
  if (agency && agency.workspace.id === shell.portal.workspaceId) {
    return {
      kind: "viewer",
      viewer: {
        ...shell,
        mode: "preview",
        portalId: shell.portal.id,
        contact: null,
        readOnly: true,
        showBadge: showsClientDockBadge(shell.workspace.plan),
      },
    };
  }

  if (shell.portal.status === "archived") return { kind: "closed", shell };
  return { kind: "needs-access", shell };
}

/** Same resolution, but throws for the mutation paths (server actions). */
export async function requireViewer(slug: string): Promise<PortalViewer> {
  const resolved = await resolveViewer(slug);
  if (resolved.kind !== "viewer") throw new PortalAccessError("Your access link has expired");
  return resolved.viewer;
}

/** A viewer who may write: a real client, never the preview. */
export async function requireActingContact(
  slug: string,
): Promise<PortalViewer & { contact: Contact }> {
  const viewer = await requireViewer(slug);
  if (viewer.mode !== "client" || !viewer.contact) {
    throw new PortalAccessError("This is the client-view preview — actions are the client's to take");
  }
  return viewer as PortalViewer & { contact: Contact };
}

/* ----------------------------------------------------------- the portal view --- */

export interface FrontDeskItem {
  headline: string;
  at: Date;
  /** Items awaiting the client carry the bell glyph (DESIGN.md front desk). */
  awaitingClient: boolean;
  href?: string;
}

export interface PortalView {
  viewer: PortalViewer;
  modules: ModuleId[];
  phases: TimelinePhase[];
  progress: number;
  stacks: FileStack[];
  approvals: ApprovalWithFile[];
  threads: ThreadWithMessages[];
  invoices: Invoice[];
  links: PortalLink[];
  frontDesk: FrontDeskItem[];
  pendingApprovals: ApprovalWithFile[];
}

/**
 * Everything a portal renders, in one place, all of it scoped to
 * `viewer.portalId`. Disabled modules are not merely hidden — they are not
 * queried, so switching a module off actually withdraws the data.
 */
export async function loadPortalView(viewer: PortalViewer): Promise<PortalView> {
  const portalId = viewer.portalId;
  const modules = viewer.portal.enabledModules as ModuleId[];
  const on = (m: ModuleId) => modules.includes(m);

  const [phases, stacks, approvalRows, threadRows, invoiceRows, links] = await Promise.all([
    on("timeline") ? listPhases(portalId) : Promise.resolve([]),
    on("files") || on("approvals") ? listFileStacks(portalId) : Promise.resolve([]),
    on("approvals") ? listApprovals(portalId) : Promise.resolve([]),
    on("messages") ? listThreads(portalId) : Promise.resolve([]),
    on("invoices") ? listInvoices(portalId) : Promise.resolve([]),
    on("links") ? listLinks(portalId) : Promise.resolve([]),
  ]);

  const pendingApprovals = approvalRows.filter((a) => a.approval.status === "pending");
  const slug = viewer.portal.slug;

  const frontDesk: FrontDeskItem[] = [];
  for (const a of pendingApprovals) {
    frontDesk.push({
      headline: `${a.approval.title} — needs your approval`,
      at: a.approval.createdAt,
      awaitingClient: true,
      href: `/p/${slug}/approvals/${a.approval.id}`,
    });
  }
  for (const stack of stacks.slice(0, 4)) {
    frontDesk.push({
      headline: `${stack.current.name} v${stack.current.version} uploaded`,
      at: stack.current.createdAt,
      awaitingClient: false,
      href: `/p/${slug}/files`,
    });
  }
  for (const t of threadRows.slice(0, 3)) {
    if (!t.lastMessage) continue;
    frontDesk.push({
      headline:
        t.lastMessage.authorKind === "agency"
          ? `${t.thread.subject} — ${t.lastMessage.authorName} wrote`
          : `${t.thread.subject} — you replied`,
      at: t.lastMessage.createdAt,
      awaitingClient: t.lastMessage.authorKind === "agency",
      href: `/p/${slug}/messages`,
    });
  }
  for (const invoice of invoiceRows) {
    if (invoice.status !== "open") continue;
    frontDesk.push({
      headline: `Invoice ${invoice.number}`,
      at: invoice.createdAt,
      awaitingClient: true,
      href: `/p/${slug}/invoices`,
    });
  }
  for (const phase of phases) {
    if (phase.progressPct === 0 || phase.progressPct === 100) continue;
    frontDesk.push({
      headline: `${phase.name} — ${phase.progressPct}% through`,
      at: phase.updatedAt,
      awaitingClient: false,
      href: `/p/${slug}/timeline`,
    });
  }

  frontDesk.sort((a, b) => b.at.getTime() - a.at.getTime());

  return {
    viewer,
    modules,
    phases,
    progress: overallProgress(phases),
    stacks,
    approvals: approvalRows,
    threads: threadRows,
    invoices: invoiceRows,
    links,
    frontDesk: frontDesk.slice(0, 6),
    pendingApprovals,
  };
}

/**
 * Count the visit. Client views only — the agency's own preview must never inflate
 * the adoption numbers the agency is being sold on.
 */
export async function recordVisit(viewer: PortalViewer): Promise<void> {
  if (viewer.mode !== "client" || !viewer.contact) return;
  await logPortalView({ portalId: viewer.portalId, contactId: viewer.contact.id });
}

/** Per-contact view counts for the agency's adoption panel (Studio: analytics). */
export async function loadAdoption(
  portalId: string,
  days = 30,
): Promise<{ contact: Contact; views: number; lastDay: Date | null }[]> {
  const db = getDb();
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db
    .select({
      contactId: portalViews.contactId,
      views: sql<number>`sum(${portalViews.views})`,
      lastDay: sql<Date>`max(${portalViews.day})`,
    })
    .from(portalViews)
    .where(and(eq(portalViews.portalId, portalId), gte(portalViews.day, since)))
    .groupBy(portalViews.contactId);

  if (rows.length === 0) return [];
  const contactRows = await db.select().from(contacts);
  return rows
    .map((r) => {
      const contact = contactRows.find((c) => c.id === r.contactId);
      return contact
        ? { contact, views: Number(r.views), lastDay: r.lastDay ? new Date(r.lastDay) : null }
        : null;
    })
    .filter((r): r is { contact: Contact; views: number; lastDay: Date | null } => r !== null)
    .sort((a, b) => b.views - a.views);
}

/** Recent portal visits, newest first — shown on the agency's portal page. */
export async function recentVisits(portalId: string, limit = 7) {
  const db = getDb();
  return db
    .select()
    .from(portalViews)
    .where(eq(portalViews.portalId, portalId))
    .orderBy(desc(portalViews.day))
    .limit(limit);
}
