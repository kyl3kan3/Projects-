/**
 * src/lib/portal.ts
 *
 * The party's view of a transaction, resolved from a token rather than a session.
 *
 * A party is not a user. They see one deal, in plain language: what is done, what
 * is next, and what is needed from them. No money, no other files, no internal
 * notes, and nothing about the other side's position — a portal that leaked the
 * commission split would end the product.
 */

import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accounts,
  criticalDates,
  deals,
  documents,
  parties,
  tasks,
  type DocumentRow,
} from "@/db/schema";
import { displayStatus, todayInZone, type DisplayDateStatus } from "@/lib/dates";
import { hashPartyToken, looksLikeToken } from "@/lib/tokens";
import { PARTY_ROLE_LABELS } from "@/lib/templates";

export interface PortalItem {
  id: string;
  taskId: string | null;
  label: string;
  dueOn: string | null;
  status: DisplayDateStatus;
  /** The sentence that computed it — a party is owed the arithmetic too. */
  sentence: string;
  mine: boolean;
  docRequired: boolean;
  documents: DocumentRow[];
}

export interface PortalView {
  partyId: string;
  partyName: string;
  partyRoleLabel: string;
  dealId: string;
  address: string;
  coordinatorName: string | null;
  coordinatorEmail: string | null;
  today: string;
  done: PortalItem[];
  next: PortalItem[];
  needed: PortalItem[];
  /**
   * What this party has already sent in.
   *
   * This is the acknowledgement, and it has to be page-level rather than a
   * message on the upload form: a successful upload moves the item out of
   * "needed", which unmounts the form and takes any inline confirmation with it.
   * A client who uploads a disclosure and sees nothing happen will email their
   * agent to ask — exactly the phone call this product exists to remove.
   */
  received: Array<{ id: string; label: string; filename: string; version: number; uploadedAt: Date }>;
  lineDates: Array<{ key: string; label: string; dueOn: string; status: DisplayDateStatus }>;
}

/**
 * Resolve a token to a view, or null. Every failure looks the same from outside:
 * a malformed token, an unknown one and a revoked one are indistinguishable.
 */
export async function loadPortal(token: string): Promise<PortalView | null> {
  if (!looksLikeToken(token)) return null;
  const db = getDb();
  const hash = hashPartyToken(token);

  const [row] = await db
    .select({
      party: parties,
      deal: deals,
      timezone: accounts.timezone,
    })
    .from(parties)
    .innerJoin(deals, eq(deals.id, parties.dealId))
    .innerJoin(accounts, eq(accounts.id, deals.accountId))
    .where(eq(parties.portalTokenHash, hash));
  if (!row) return null;

  const today = todayInZone(row.timezone);

  const [taskRows, dateRows, docRows, coordinatorRows] = await Promise.all([
    db.select().from(tasks).where(eq(tasks.dealId, row.deal.id)).orderBy(asc(tasks.sortOrder)),
    db
      .select()
      .from(criticalDates)
      .where(eq(criticalDates.dealId, row.deal.id))
      .orderBy(asc(criticalDates.dueOn)),
    db.select().from(documents).where(eq(documents.dealId, row.deal.id)),
    db
      .select({ name: parties.name, email: parties.email })
      .from(parties)
      .where(and(eq(parties.dealId, row.deal.id), eq(parties.role, "tc"))),
  ]);

  const dateByTask = new Map(dateRows.filter((d) => d.taskId).map((d) => [d.taskId as string, d]));
  const docsByTask = new Map<string, DocumentRow[]>();
  const docsByLabel = new Map<string, DocumentRow[]>();
  for (const doc of docRows) {
    if (doc.taskId) {
      const list = docsByTask.get(doc.taskId) ?? [];
      list.push(doc);
      docsByTask.set(doc.taskId, list);
    }
    const byLabel = docsByLabel.get(doc.label) ?? [];
    byLabel.push(doc);
    docsByLabel.set(doc.label, byLabel);
  }

  const items: PortalItem[] = taskRows.map((task) => {
    const date = dateByTask.get(task.id) ?? null;
    const docs = (docsByTask.get(task.id) ?? docsByLabel.get(task.label) ?? []).sort(
      (a, b) => b.version - a.version,
    );
    const sentence =
      date && typeof (date.computedFrom as { sentence?: unknown } | null)?.sentence === "string"
        ? (date.computedFrom as { sentence: string }).sentence
        : "";
    return {
      id: date?.id ?? task.id,
      taskId: task.id,
      label: task.label,
      dueOn: date?.dueOn ?? null,
      status: date
        ? displayStatus({ dueOn: date.dueOn, status: date.status }, today)
        : task.status === "done"
          ? "met"
          : task.status === "na"
            ? "waived"
            : "unset",
      sentence,
      mine: task.ownerRole === row.party.role,
      docRequired: task.docRequired,
      documents: docs,
    };
  });

  const done = items.filter((i) => i.status === "met");
  const openItems = items.filter((i) => i.status !== "met" && i.status !== "waived");
  const needed = openItems.filter((i) => i.mine && i.docRequired && i.documents.length === 0);
  const neededIds = new Set(needed.map((i) => i.taskId));
  const next = openItems
    .filter((i) => !neededIds.has(i.taskId))
    .sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"))
    .slice(0, 8);

  const mine = `${row.party.name} (${row.party.role})`;
  const received = docRows
    .filter((d) => d.uploadedBy === mine)
    .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())
    .map((d) => ({
      id: d.id,
      label: d.label,
      filename: d.filename,
      version: d.version,
      uploadedAt: d.uploadedAt,
    }));

  return {
    partyId: row.party.id,
    partyName: row.party.name,
    partyRoleLabel: PARTY_ROLE_LABELS[row.party.role],
    dealId: row.deal.id,
    address: row.deal.address,
    coordinatorName: coordinatorRows[0]?.name ?? null,
    coordinatorEmail: coordinatorRows[0]?.email ?? null,
    today,
    done: done.sort((a, b) => (a.dueOn ?? "").localeCompare(b.dueOn ?? "")),
    next,
    needed,
    received,
    lineDates: dateRows.map((d) => ({
      key: d.key,
      label: d.label,
      dueOn: d.dueOn,
      status: displayStatus({ dueOn: d.dueOn, status: d.status }, today),
    })),
  };
}

/** Resolve a token to just the party id, for the upload action. */
export async function partyIdForToken(token: string): Promise<{ partyId: string; dealId: string } | null> {
  if (!looksLikeToken(token)) return null;
  const [row] = await getDb()
    .select({ id: parties.id, dealId: parties.dealId })
    .from(parties)
    .where(eq(parties.portalTokenHash, hashPartyToken(token)));
  return row ? { partyId: row.id, dealId: row.dealId } : null;
}
