/**
 * Documents: the status machine, the block helpers, and the read/write paths
 * every screen goes through.
 *
 * The chain transitions themselves (proposal → contract → invoices) live in
 * chain.ts; this file is what a single document is and how it may change.
 */

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  brands,
  clients,
  docBlocks,
  documents,
  events,
  invoices,
  signatures,
  type BlockContent,
  type Brand,
  type Client,
  type DocBlock,
  type DocEvent,
  type DocumentRow,
  type DocumentStatus,
  type DocumentType,
  type EventType,
  type Invoice,
  type LineItem,
  type Signature,
} from "@/db/schema";
import { computeTotals, type Totals } from "@/lib/money";
import { newPublicToken } from "@/lib/esign";

/* --------------------------------------------------------- status machine --- */

/**
 * The legal moves, per type. Anything not listed is refused — a proposal cannot
 * be "signed", an invoice cannot be "accepted", and nothing leaves `paid`.
 *
 * `void` is reachable from every non-terminal state: voiding is the only
 * correction a signed document allows (ARCHITECTURE.md §3, immutability).
 */
const TRANSITIONS: Record<DocumentType, Partial<Record<DocumentStatus, DocumentStatus[]>>> = {
  proposal: {
    draft: ["sent", "void"],
    sent: ["viewed", "accepted", "void"],
    viewed: ["accepted", "void"],
    accepted: ["void"],
  },
  contract: {
    draft: ["sent", "void"],
    sent: ["viewed", "signed", "void"],
    viewed: ["signed", "void"],
    signed: ["void"],
  },
  invoice: {
    draft: ["sent", "void"],
    sent: ["viewed", "overdue", "paid", "void"],
    viewed: ["overdue", "paid", "void"],
    overdue: ["paid", "void"],
  },
};

export function canTransition(
  type: DocumentType,
  from: DocumentStatus,
  to: DocumentStatus,
): boolean {
  if (from === to) return false;
  return (TRANSITIONS[type]?.[from] ?? []).includes(to);
}

/** The word on the seal chip. Type-aware: a signed proposal is "Accepted". */
export function statusLabel(type: DocumentType, status: DocumentStatus): string {
  if (status === "void") return "Void";
  if (status === "draft") return "Draft";
  if (status === "sent") return "Sent";
  if (status === "viewed") return "Viewed";
  if (status === "accepted") return "Accepted";
  if (status === "signed") return "Signed";
  if (status === "overdue") return "Overdue";
  return type === "invoice" ? "Paid" : "Complete";
}

/** Which seal-chip treatment a status gets (DESIGN.md component table). */
export type SealVariant = "draft" | "sent" | "signed" | "paid" | "overdue" | "void";

export function sealVariant(status: DocumentStatus): SealVariant {
  switch (status) {
    case "draft":
      return "draft";
    case "sent":
    case "viewed":
      return "sent";
    case "accepted":
    case "signed":
      return "signed";
    case "paid":
      return "paid";
    case "overdue":
      return "overdue";
    default:
      return "void";
  }
}

export const DOCUMENT_NOUN: Record<DocumentType, string> = {
  proposal: "Proposal",
  contract: "Contract",
  invoice: "Invoice",
};

/* ----------------------------------------------------------------- blocks --- */

export function pricingLines(blocks: readonly Pick<DocBlock, "kind" | "content">[]): LineItem[] {
  const out: LineItem[] = [];
  for (const block of blocks) {
    if (block.content?.kind === "pricing_table") out.push(...block.content.lines);
  }
  return out;
}

/** Totals across every pricing table in a document. */
export function documentTotals(
  blocks: readonly Pick<DocBlock, "kind" | "content">[],
  taxRateBps: number,
): Totals {
  return computeTotals(pricingLines(blocks), taxRateBps);
}

/**
 * Apply the client's add-on choices to a pricing table. Required rows are
 * untouched; optional rows are selected only if the client ticked them. Unknown
 * ids are ignored rather than trusted — the form is client-controlled input.
 */
export function applySelections(lines: readonly LineItem[], selectedIds: readonly string[]): LineItem[] {
  const chosen = new Set(selectedIds);
  return lines.map((line) =>
    line.optional ? { ...line, selected: chosen.has(line.id) } : { ...line, selected: true },
  );
}

/** Rewrite the pricing tables of a block list with the client's selections. */
export function blocksWithSelections(
  blocks: readonly Pick<DocBlock, "kind" | "position" | "content">[],
  selectedIds: readonly string[],
): { kind: DocBlock["kind"]; position: number; content: BlockContent }[] {
  return blocks.map((block) => {
    if (block.content?.kind !== "pricing_table") {
      return { kind: block.kind, position: block.position, content: block.content };
    }
    return {
      kind: block.kind,
      position: block.position,
      content: {
        ...block.content,
        lines: applySelections(block.content.lines, selectedIds),
      },
    };
  });
}

/**
 * Drop unselected add-ons entirely. Used when snapshotting an accepted proposal
 * into a contract: the contract should read as the deal that was struck, not as
 * a menu with items crossed out.
 */
export function pruneUnselected(
  blocks: readonly { kind: DocBlock["kind"]; position: number; content: BlockContent }[],
): { kind: DocBlock["kind"]; position: number; content: BlockContent }[] {
  return blocks.map((block) => {
    if (block.content.kind !== "pricing_table") return block;
    return {
      ...block,
      content: {
        ...block.content,
        lines: block.content.lines
          .filter((l) => !l.optional || l.selected)
          .map((l) => ({ ...l, optional: false, selected: true })),
      },
    };
  });
}

/* ------------------------------------------------------------ read paths --- */

export interface DocumentBundle {
  document: DocumentRow;
  client: Client;
  brand: Brand | null;
  blocks: DocBlock[];
  invoice: Invoice | null;
  signature: Signature | null;
  totals: Totals;
}

export async function loadBundle(documentId: string): Promise<DocumentBundle | null> {
  const db = getDb();
  const [document] = await db.select().from(documents).where(eq(documents.id, documentId));
  if (!document) return null;
  return hydrate(document);
}

export async function loadBundleByToken(token: string): Promise<DocumentBundle | null> {
  const db = getDb();
  const [document] = await db.select().from(documents).where(eq(documents.publicToken, token));
  if (!document) return null;
  return hydrate(document);
}

async function hydrate(document: DocumentRow): Promise<DocumentBundle> {
  const db = getDb();
  const [client] = await db.select().from(clients).where(eq(clients.id, document.clientId));
  const brand = document.brandId
    ? (await db.select().from(brands).where(eq(brands.id, document.brandId)))[0] ?? null
    : null;
  const blocks = await db
    .select()
    .from(docBlocks)
    .where(eq(docBlocks.documentId, document.id))
    .orderBy(asc(docBlocks.position));
  const [invoice] =
    document.type === "invoice"
      ? await db.select().from(invoices).where(eq(invoices.documentId, document.id))
      : [];
  const [signature] = await db
    .select()
    .from(signatures)
    .where(eq(signatures.documentId, document.id))
    .orderBy(desc(signatures.signedAt))
    .limit(1);

  return {
    document,
    client,
    brand,
    blocks,
    invoice: invoice ?? null,
    signature: signature ?? null,
    totals: documentTotals(blocks, document.taxRateBps),
  };
}

export async function listDocuments(userId: string): Promise<DocumentRow[]> {
  const db = getDb();
  return db
    .select()
    .from(documents)
    .where(eq(documents.userId, userId))
    .orderBy(desc(documents.createdAt));
}

export async function documentTimeline(documentId: string): Promise<DocEvent[]> {
  const db = getDb();
  return db
    .select()
    .from(events)
    .where(eq(events.documentId, documentId))
    .orderBy(asc(events.createdAt));
}

/**
 * Totals for a set of documents, computed from their blocks. Proposals and
 * contracts have no invoice row, so this is the only way a list can show what
 * they are worth.
 */
export async function totalsFor(documentIds: string[]): Promise<Map<string, number>> {
  if (!documentIds.length) return new Map();
  const db = getDb();
  const rows = await db
    .select()
    .from(documents)
    .where(inArray(documents.id, documentIds));
  const blocks = await db
    .select()
    .from(docBlocks)
    .where(inArray(docBlocks.documentId, documentIds));
  const out = new Map<string, number>();
  for (const doc of rows) {
    const own = blocks.filter((b) => b.documentId === doc.id);
    out.set(doc.id, documentTotals(own, doc.taxRateBps).total);
  }
  return out;
}

/** Invoice rows for a set of documents, keyed by document id. */
export async function invoicesFor(documentIds: string[]): Promise<Map<string, Invoice>> {
  if (!documentIds.length) return new Map();
  const db = getDb();
  const rows = await db.select().from(invoices).where(inArray(invoices.documentId, documentIds));
  return new Map(rows.map((r) => [r.documentId, r]));
}

/* ----------------------------------------------------------- write paths --- */

export async function logEvent(
  documentId: string,
  type: EventType,
  detail = "",
  actor = "you",
  metadata?: Record<string, unknown>,
): Promise<void> {
  const db = getDb();
  await db.insert(events).values({ documentId, type, detail, actor, metadata });
}

export interface CreateDocumentInput {
  userId: string;
  brandId: string | null;
  clientId: string;
  type: DocumentType;
  title: string;
  currency: string;
  taxRateBps: number;
  taxLabel: string;
  depositPercent: number;
  netDays: number;
  parentDocumentId?: string | null;
  status?: DocumentStatus;
  expiresAt?: Date | null;
  blocks: { kind: DocBlock["kind"]; position: number; content: BlockContent }[];
}

export async function createDocument(input: CreateDocumentInput): Promise<DocumentRow> {
  const db = getDb();
  const [document] = await db
    .insert(documents)
    .values({
      userId: input.userId,
      brandId: input.brandId,
      clientId: input.clientId,
      type: input.type,
      title: input.title,
      status: input.status ?? "draft",
      parentDocumentId: input.parentDocumentId ?? null,
      publicToken: newPublicToken(),
      currency: input.currency,
      taxRateBps: input.taxRateBps,
      taxLabel: input.taxLabel,
      depositPercent: input.depositPercent,
      netDays: input.netDays,
      expiresAt: input.expiresAt ?? null,
    })
    .returning();

  if (input.blocks.length) {
    await db.insert(docBlocks).values(
      input.blocks.map((b, i) => ({
        documentId: document.id,
        kind: b.kind,
        position: b.position ?? i,
        content: b.content,
      })),
    );
  }
  return document;
}

/** Replace a draft's blocks wholesale. Refused once the document is locked. */
export async function replaceBlocks(
  documentId: string,
  blocks: { kind: DocBlock["kind"]; position: number; content: BlockContent }[],
): Promise<void> {
  const db = getDb();
  const [document] = await db.select().from(documents).where(eq(documents.id, documentId));
  if (!document) throw new Error("Document not found");
  if (document.status !== "draft") {
    throw new Error("This document has been sent — void it and reissue to change the terms.");
  }
  await db.delete(docBlocks).where(eq(docBlocks.documentId, documentId));
  if (blocks.length) {
    await db.insert(docBlocks).values(
      blocks.map((b, i) => ({
        documentId,
        kind: b.kind,
        position: b.position ?? i,
        content: b.content,
      })),
    );
  }
  await db.update(documents).set({ updatedAt: new Date() }).where(eq(documents.id, documentId));
}

/**
 * Move a document to a new status, refusing illegal moves. Returns the updated
 * row, or null when the transition was not allowed (callers decide whether that
 * is an error or a no-op).
 */
export async function transition(
  documentId: string,
  to: DocumentStatus,
  stamps: Partial<Pick<DocumentRow, "sentAt" | "firstViewedAt" | "acceptedAt" | "signedAt" | "voidedAt">> = {},
): Promise<DocumentRow | null> {
  const db = getDb();
  const [document] = await db.select().from(documents).where(eq(documents.id, documentId));
  if (!document) return null;
  if (!canTransition(document.type, document.status, to)) return null;
  const [updated] = await db
    .update(documents)
    .set({ status: to, updatedAt: new Date(), ...stamps })
    .where(and(eq(documents.id, documentId), eq(documents.status, document.status)))
    .returning();
  return updated ?? null;
}

/** Record the first client view. Idempotent; never downgrades a status. */
export async function recordView(document: DocumentRow, actor: string): Promise<void> {
  const db = getDb();
  const first = !document.firstViewedAt;
  if (first) {
    await db
      .update(documents)
      .set({ firstViewedAt: new Date() })
      .where(eq(documents.id, document.id));
    await logEvent(document.id, "viewed", "Opened the link", actor);
  }
  if (document.status === "sent") {
    await transition(document.id, "viewed");
  }
}

export async function voidDocument(document: DocumentRow, reason: string): Promise<boolean> {
  const updated = await transition(document.id, "void", { voidedAt: new Date() });
  if (!updated) return false;
  await logEvent(document.id, "voided", reason || "Voided", "you");
  return true;
}

/** Documents created by this account in the current UTC month (plan quota). */
export async function documentsCreatedThisMonth(userId: string, now = new Date()): Promise<number> {
  const db = getDb();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(documents)
    .where(
      and(
        eq(documents.userId, userId),
        sql`${documents.createdAt} >= ${from.toISOString()}`,
        // Chain-generated documents are exempt (see plans.ts canCreateDocument).
        sql`${documents.parentDocumentId} is null`,
      ),
    );
  return row?.count ?? 0;
}
