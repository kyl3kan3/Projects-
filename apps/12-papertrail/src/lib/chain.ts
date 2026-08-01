/**
 * The chain: proposal → contract → deposit invoice → balance invoice.
 *
 * This is the product (README, "Differentiation"): acceptance data flows
 * forward and nothing is retyped. Two rules hold it together.
 *
 * **Snapshot, never reference.** A contract copies the accepted scope and the
 * accepted prices into its own blocks. An invoice copies the signed total. Edit
 * a proposal after acceptance and the signed history does not move — because it
 * was never pointing at the proposal in the first place.
 *
 * **The deposit is the point.** The moment a contract is signed the deposit
 * invoice exists and is on its way (README, "Deposit-on-signature default").
 * The freelancer does not have to be awake for it.
 */

import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  brands,
  clients,
  docBlocks,
  documents,
  invoices,
  signatures,
  users,
  type Brand,
  type Client,
  type DocumentRow,
  type Invoice,
  type PlanId,
  type User,
} from "@/db/schema";
import { balanceDue, formatMoney, splitDeposit } from "@/lib/money";
import { plan } from "@/lib/plans";
import {
  blocksWithSelections,
  createDocument,
  documentTotals,
  logEvent,
  pruneUnselected,
  transition,
  type DocumentBundle,
} from "@/lib/documents";
import { issueInvoice } from "@/lib/invoices";
import { balanceInvoiceBlocks, contractClauses, depositInvoiceBlocks } from "@/lib/templates";
import { CONSENT_TEXT, acceptanceState, signingState, validateSignature } from "@/lib/esign";
import { sendDocument } from "@/lib/delivery";

/* ------------------------------------------------------------ chain reads --- */

export interface ChainNode {
  document: DocumentRow;
  invoice: Invoice | null;
  total: number;
}

/**
 * Every document in the same chain as `document`, ordered proposal → contract →
 * invoices (deposit before balance, then by creation).
 */
export async function chainFor(document: DocumentRow): Promise<ChainNode[]> {
  const db = getDb();

  // Walk up to the root. Chains are three or four deep, so the loop is bounded
  // hard rather than trusted to terminate.
  let root = document;
  for (let hops = 0; hops < 8 && root.parentDocumentId; hops++) {
    const [parent] = await db.select().from(documents).where(eq(documents.id, root.parentDocumentId));
    if (!parent) break;
    root = parent;
  }

  const collected: DocumentRow[] = [root];
  let frontier = [root.id];
  for (let depth = 0; depth < 8 && frontier.length; depth++) {
    const children = await db
      .select()
      .from(documents)
      .where(inArray(documents.parentDocumentId, frontier))
      .orderBy(asc(documents.createdAt));
    if (!children.length) break;
    collected.push(...children);
    frontier = children.map((c) => c.id);
  }

  const invoiceRows = await db
    .select()
    .from(invoices)
    .where(inArray(invoices.documentId, collected.map((d) => d.id)));
  const invoiceByDoc = new Map(invoiceRows.map((r) => [r.documentId, r]));

  const blocks = await db
    .select()
    .from(docBlocks)
    .where(inArray(docBlocks.documentId, collected.map((d) => d.id)))
    .orderBy(asc(docBlocks.position));

  const nodes: ChainNode[] = collected.map((doc) => {
    const invoice = invoiceByDoc.get(doc.id) ?? null;
    const total = invoice
      ? invoice.total
      : documentTotals(
          blocks.filter((b) => b.documentId === doc.id),
          doc.taxRateBps,
        ).total;
    return { document: doc, invoice, total };
  });

  return nodes.sort(compareChainNodes);
}

const TYPE_ORDER = { proposal: 0, contract: 1, invoice: 2 } as const;
const KIND_ORDER = { deposit: 0, standalone: 1, balance: 2 } as const;

export function compareChainNodes(a: ChainNode, b: ChainNode): number {
  const byType = TYPE_ORDER[a.document.type] - TYPE_ORDER[b.document.type];
  if (byType !== 0) return byType;
  if (a.invoice && b.invoice) {
    const byKind = KIND_ORDER[a.invoice.kind] - KIND_ORDER[b.invoice.kind];
    if (byKind !== 0) return byKind;
  }
  return a.document.createdAt.getTime() - b.document.createdAt.getTime();
}

/** The chains on an account, newest engagement first, for the Chain screen. */
export async function listChains(userId: string): Promise<
  { root: DocumentRow; client: Client; nodes: ChainNode[]; total: number; collected: number }[]
> {
  const db = getDb();
  const roots = await db
    .select()
    .from(documents)
    .where(and(eq(documents.userId, userId), eq(documents.type, "proposal")))
    .orderBy(asc(documents.createdAt));

  const clientRows = await db.select().from(clients).where(eq(clients.userId, userId));
  const clientById = new Map(clientRows.map((c) => [c.id, c]));

  const chains = [] as {
    root: DocumentRow;
    client: Client;
    nodes: ChainNode[];
    total: number;
    collected: number;
  }[];

  for (const root of roots) {
    const nodes = await chainFor(root);
    const client = clientById.get(root.clientId);
    if (!client) continue;
    const contract = nodes.find((n) => n.document.type === "contract");
    const total = contract?.total ?? nodes[0]?.total ?? 0;
    const collected = nodes.reduce((sum, n) => sum + (n.invoice?.amountPaid ?? 0), 0);
    chains.push({ root, client, nodes, total, collected });
  }

  return chains.reverse();
}

/* ------------------------------------------------- proposal → contract --- */

export interface AcceptInput {
  selectedIds: string[];
  actorEmail: string;
}

export interface AcceptResult {
  ok: boolean;
  error?: string;
  contract?: DocumentRow;
}

/**
 * The client accepts a proposal.
 *
 * The selections are written back onto the proposal (so it reads as what was
 * agreed), then copied — with unselected add-ons dropped — into a draft
 * contract, together with clauses generated from the accepted figures.
 */
export async function acceptProposal(
  bundle: DocumentBundle,
  input: AcceptInput,
  now = new Date(),
): Promise<AcceptResult> {
  const { document } = bundle;
  const state = acceptanceState(document.publicToken, document, now);
  if (state !== "ok") return { ok: false, error: state };

  const db = getDb();
  const snapshot = blocksWithSelections(bundle.blocks, input.selectedIds);

  // Write the client's choices back onto the proposal itself.
  await db.delete(docBlocks).where(eq(docBlocks.documentId, document.id));
  await db.insert(docBlocks).values(
    snapshot.map((b) => ({
      documentId: document.id,
      kind: b.kind,
      position: b.position,
      content: b.content,
    })),
  );

  const totals = documentTotals(snapshot, document.taxRateBps);

  const moved = await transition(document.id, "accepted", { acceptedAt: now });
  if (!moved) return { ok: false, error: "not_sent" };

  await logEvent(
    document.id,
    "accepted",
    `Accepted at ${formatMoney(totals.total, document.currency)}`,
    input.actorEmail || bundle.client.email,
    { selected: input.selectedIds },
  );

  const [owner] = await db.select().from(users).where(eq(users.id, document.userId));
  const freelancerName = owner?.name?.trim() || owner?.email || "the Contractor";

  const contractBlocks = [
    ...pruneUnselected(snapshot),
    {
      kind: "terms" as const,
      position: snapshot.length,
      content: {
        kind: "terms" as const,
        clauses: contractClauses({
          clientName: bundle.client.name,
          clientCompany: bundle.client.company,
          freelancerName,
          currency: document.currency,
          total: totals.total,
          depositPercent: plan(owner?.plan ?? "free").depositInvoices ? document.depositPercent : 0,
          netDays: document.netDays,
          proposalTitle: document.title,
        }),
      },
    },
    {
      kind: "signature" as const,
      position: snapshot.length + 1,
      content: { kind: "signature" as const, label: "Signature of the Client" },
    },
  ];

  const contract = await createDocument({
    userId: document.userId,
    brandId: document.brandId,
    clientId: document.clientId,
    type: "contract",
    title: document.title,
    currency: document.currency,
    taxRateBps: document.taxRateBps,
    taxLabel: document.taxLabel,
    depositPercent: document.depositPercent,
    netDays: document.netDays,
    parentDocumentId: document.id,
    status: "draft",
    blocks: contractBlocks,
  });

  await logEvent(
    contract.id,
    "chained",
    `Drafted from the accepted proposal — ${formatMoney(totals.total, document.currency)}`,
    "papertrail",
  );

  return { ok: true, contract };
}

/* --------------------------------------------- contract → deposit invoice --- */

export interface SignInput {
  signerName: string;
  signerEmail: string;
  method: "typed" | "drawn";
  signatureData: string;
  consented: boolean;
  ip: string;
  userAgent: string;
}

export interface SignResult {
  ok: boolean;
  error?: string;
  depositInvoice?: DocumentRow | null;
  /** True when the account's plan doesn't include deposits (single invoice). */
  fullInvoice?: boolean;
}

/**
 * The client signs the contract.
 *
 * Order matters: the signature row is written first (it is the record), then the
 * contract is locked, then the deposit invoice is raised and sent. A failure
 * raising the invoice must never lose the signature, so the invoice work is
 * caught and logged rather than allowed to roll the signature back.
 */
export async function signContract(
  bundle: DocumentBundle,
  input: SignInput,
  now = new Date(),
): Promise<SignResult> {
  const { document } = bundle;
  const state = signingState(document.publicToken, document, now);
  if (state !== "ok") return { ok: false, error: state };

  const validation = validateSignature(input);
  if (!validation.ok) return { ok: false, error: validation.error };

  const db = getDb();
  await db.insert(signatures).values({
    documentId: document.id,
    signerName: input.signerName.trim(),
    signerEmail: input.signerEmail.trim().toLowerCase(),
    method: input.method,
    signatureData: input.signatureData,
    consentText: CONSENT_TEXT,
    ip: input.ip,
    userAgent: input.userAgent,
    signedAt: now,
  });

  const moved = await transition(document.id, "signed", { signedAt: now });
  if (!moved) return { ok: false, error: "already_done" };

  await logEvent(
    document.id,
    "signed",
    `Signed by ${input.signerName.trim()}`,
    input.signerEmail.trim().toLowerCase(),
    { method: input.method, ip: input.ip },
  );

  try {
    return { ok: true, ...(await raiseFirstInvoice(document, now)) };
  } catch (err) {
    console.error("[chain] signature recorded but invoicing failed", err);
    await logEvent(
      document.id,
      "chained",
      "Signed, but the deposit invoice could not be raised — raise it from the contract screen.",
      "papertrail",
    );
    return { ok: true, depositInvoice: null };
  }
}

/**
 * Raise the invoice that follows a signature: the deposit on plans that include
 * deposits, otherwise the whole amount in one invoice.
 */
async function raiseFirstInvoice(
  contract: DocumentRow,
  now: Date,
): Promise<{ depositInvoice: DocumentRow | null; fullInvoice: boolean }> {
  const db = getDb();
  const blocks = await db
    .select()
    .from(docBlocks)
    .where(eq(docBlocks.documentId, contract.id))
    .orderBy(asc(docBlocks.position));
  const totals = documentTotals(blocks, contract.taxRateBps);
  if (totals.total <= 0) return { depositInvoice: null, fullInvoice: false };

  const [owner] = await db.select().from(users).where(eq(users.id, contract.userId));
  const limits = plan(owner?.plan ?? "free");
  const depositsAllowed = limits.depositInvoices && contract.depositPercent > 0;
  const split = splitDeposit(totals.total, depositsAllowed ? contract.depositPercent : 100);

  const issued = await issueInvoice({
    userId: contract.userId,
    brandId: contract.brandId,
    clientId: contract.clientId,
    title: depositsAllowed ? `Deposit — ${contract.title}` : contract.title,
    currency: contract.currency,
    // The percentage was taken from a total that already includes tax, so the
    // invoice itself must not add tax a second time.
    taxRateBps: 0,
    taxLabel: contract.taxLabel,
    netDays: depositsAllowed ? 0 : contract.netDays,
    depositPercent: contract.depositPercent,
    kind: depositsAllowed ? "deposit" : "standalone",
    subtotal: split.deposit,
    tax: 0,
    total: split.deposit,
    parentDocumentId: contract.id,
    blocks: depositsAllowed
      ? depositInvoiceBlocks({
          depositPercent: contract.depositPercent,
          depositAmount: split.deposit,
          contractTotal: totals.total,
          currency: contract.currency,
          contractTitle: contract.title,
        })
      : balanceInvoiceBlocks({
          balanceAmount: split.deposit,
          contractTotal: totals.total,
          alreadyInvoiced: 0,
          currency: contract.currency,
          contractTitle: contract.title,
        }),
    issuedAt: now,
  });

  await deliverInvoice(issued.document, issued.invoice);
  return { depositInvoice: issued.document, fullInvoice: !depositsAllowed };
}

/* ---------------------------------------------- contract → balance invoice --- */

export interface BalanceResult {
  ok: boolean;
  error?: string;
  invoice?: DocumentRow;
}

/**
 * Mark the work complete and invoice the remainder: the signed total less
 * everything already invoiced under this contract. Refuses to raise a second
 * balance invoice, and refuses when nothing is left to bill.
 */
export async function issueBalanceInvoice(
  contract: DocumentRow,
  now = new Date(),
): Promise<BalanceResult> {
  if (contract.type !== "contract") return { ok: false, error: "Not a contract" };
  if (contract.status !== "signed") {
    return { ok: false, error: "The contract has to be signed before the balance is invoiced." };
  }

  const db = getDb();
  const children = await db
    .select()
    .from(documents)
    .where(eq(documents.parentDocumentId, contract.id));
  const childInvoices = children.length
    ? await db.select().from(invoices).where(inArray(invoices.documentId, children.map((c) => c.id)))
    : [];

  const live = childInvoices.filter((inv) => {
    const doc = children.find((c) => c.id === inv.documentId);
    return doc && doc.status !== "void";
  });
  if (live.some((inv) => inv.kind === "balance")) {
    return { ok: false, error: "The balance invoice for this contract has already been raised." };
  }

  const blocks = await db
    .select()
    .from(docBlocks)
    .where(eq(docBlocks.documentId, contract.id))
    .orderBy(asc(docBlocks.position));
  const totals = documentTotals(blocks, contract.taxRateBps);
  const alreadyInvoiced = live.reduce((sum, inv) => sum + inv.total, 0);
  const remaining = totals.total - alreadyInvoiced;
  if (remaining <= 0) {
    return { ok: false, error: "Everything under this contract has already been invoiced." };
  }

  const deposit = live.find((inv) => inv.kind === "deposit");
  const issued = await issueInvoice({
    userId: contract.userId,
    brandId: contract.brandId,
    clientId: contract.clientId,
    title: `Final — ${contract.title}`,
    currency: contract.currency,
    taxRateBps: 0,
    taxLabel: contract.taxLabel,
    netDays: contract.netDays,
    depositPercent: contract.depositPercent,
    kind: "balance",
    subtotal: remaining,
    tax: 0,
    total: remaining,
    parentDocumentId: contract.id,
    depositOfDocumentId: deposit?.documentId ?? null,
    blocks: balanceInvoiceBlocks({
      balanceAmount: remaining,
      contractTotal: totals.total,
      alreadyInvoiced,
      currency: contract.currency,
      contractTitle: contract.title,
    }),
    issuedAt: now,
  });

  await deliverInvoice(issued.document, issued.invoice);
  return { ok: true, invoice: issued.document };
}

/* ---------------------------------------------------------------- helpers --- */

/** Email an invoice to the client, with the account's brand and plan applied. */
export async function deliverInvoice(document: DocumentRow, invoice: Invoice): Promise<void> {
  const db = getDb();
  const [client] = await db.select().from(clients).where(eq(clients.id, document.clientId));
  const [owner] = await db.select().from(users).where(eq(users.id, document.userId));
  const brand = document.brandId
    ? (await db.select().from(brands).where(eq(brands.id, document.brandId)))[0] ?? null
    : null;
  if (!client || !owner) return;

  await sendDocument({
    document,
    client,
    brand,
    freelancerName: owner.name?.trim() || owner.email,
    freelancerEmail: owner.email,
    planId: owner.plan,
    total: invoice.total,
    invoiceNumber: invoice.number,
    dueAt: invoice.dueAt,
  });
}

/** What the chain has collected and what is still out, for the Chain header. */
export function chainMoney(nodes: ChainNode[]): {
  engagement: number;
  collected: number;
  outstanding: number;
} {
  const contract = nodes.find((n) => n.document.type === "contract");
  const engagement = contract?.total ?? nodes[0]?.total ?? 0;
  let collected = 0;
  let outstanding = 0;
  for (const node of nodes) {
    if (!node.invoice || node.document.status === "void") continue;
    collected += node.invoice.amountPaid;
    outstanding += balanceDue(node.invoice);
  }
  return { engagement, collected, outstanding };
}

/**
 * The node whose status landed in the last minute, if any.
 *
 * DESIGN.md's signature detail is the thread drawing taut and the next node
 * stitching into existence when a client signs — "live, or replayed on next
 * open". This is the replay: whoever opens the app within a minute of the
 * signature or the payment sees it happen, and everybody else sees the finished
 * state with no animation at all.
 */
export function recentlyChangedId(nodes: ChainNode[], now: Date, windowMs = 60_000): string | undefined {
  let best: { id: string; at: number } | null = null;
  for (const node of nodes) {
    const at = Math.max(
      node.document.signedAt?.getTime() ?? 0,
      node.document.acceptedAt?.getTime() ?? 0,
      node.invoice?.paidAt?.getTime() ?? 0,
      // A freshly stitched invoice is the other half of the moment.
      node.document.type === "invoice" ? node.document.createdAt.getTime() : 0,
    );
    if (at && now.getTime() - at <= windowMs && (!best || at > best.at)) {
      best = { id: node.document.id, at };
    }
  }
  return best?.id;
}

/** The contextual primary action for a chain, per DESIGN.md's Chain screen. */
export function chainAction(nodes: ChainNode[]): { label: string; documentId: string } | null {
  const proposal = nodes.find((n) => n.document.type === "proposal");
  const contract = nodes.find((n) => n.document.type === "contract");
  const invoiceNodes = nodes.filter((n) => n.document.type === "invoice" && n.invoice);

  if (proposal && proposal.document.status === "draft") {
    return { label: "Send proposal", documentId: proposal.document.id };
  }
  if (contract && contract.document.status === "draft") {
    return { label: "Send contract for signature", documentId: contract.document.id };
  }
  const unpaid = invoiceNodes.find(
    (n) => n.document.status !== "paid" && n.document.status !== "void" && balanceDue(n.invoice!) > 0,
  );
  if (unpaid) {
    const label =
      unpaid.document.status === "overdue"
        ? `Remind — ${unpaid.invoice!.number}`
        : `Open ${unpaid.invoice!.number}`;
    return { label, documentId: unpaid.document.id };
  }
  const invoiced = invoiceNodes
    .filter((n) => n.document.status !== "void")
    .reduce((sum, n) => sum + n.invoice!.total, 0);
  if (
    contract &&
    contract.document.status === "signed" &&
    invoiced < contract.total &&
    !invoiceNodes.some((n) => n.invoice!.kind === "balance")
  ) {
    return { label: "Invoice the balance", documentId: contract.document.id };
  }
  return null;
}
