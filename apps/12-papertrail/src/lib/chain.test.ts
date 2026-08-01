import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chainAction, chainMoney, compareChainNodes, recentlyChangedId, type ChainNode } from "@/lib/chain";
import { lastCompleteIndex } from "@/components/Chain";
import type { DocumentRow, DocumentStatus, DocumentType, Invoice, InvoiceKind } from "@/db/schema";

const at = (iso: string) => new Date(iso);
const NOW = at("2026-08-04T10:00:00Z");

let seq = 0;

function doc(
  type: DocumentType,
  status: DocumentStatus,
  overrides: Partial<DocumentRow> = {},
): DocumentRow {
  seq++;
  return {
    id: `doc-${seq}`,
    userId: "user-1",
    brandId: "brand-1",
    clientId: "client-1",
    type,
    status,
    title: "Website redesign — Meridian Coffee",
    parentDocumentId: null,
    publicToken: `token-${seq}`,
    currency: "USD",
    taxRateBps: 0,
    taxLabel: "Tax",
    depositPercent: 30,
    netDays: 14,
    sentAt: at("2026-07-04T09:00:00Z"),
    firstViewedAt: null,
    acceptedAt: null,
    signedAt: null,
    voidedAt: null,
    expiresAt: null,
    createdAt: at(`2026-07-0${Math.min(9, seq)}T09:00:00Z`),
    updatedAt: at("2026-07-04T09:00:00Z"),
    ...overrides,
  };
}

function invoice(kind: InvoiceKind, total: number, paid: number, overrides: Partial<Invoice> = {}): Invoice {
  return {
    documentId: "doc-x",
    number: "INV-001",
    kind,
    currency: "USD",
    subtotal: total,
    tax: 0,
    total,
    amountPaid: paid,
    issuedAt: at("2026-07-14T09:00:00Z"),
    dueAt: at("2026-07-28T23:59:59.999Z"),
    paidAt: paid >= total ? at("2026-07-15T09:00:00Z") : null,
    depositOfDocumentId: null,
    paymentUrl: null,
    paymentUrlAmount: null,
    ...overrides,
  };
}

function node(document: DocumentRow, inv: Invoice | null, total: number): ChainNode {
  return { document, invoice: inv, total };
}

/** A full, settled-deposit chain: proposal → contract → deposit(paid). */
function chain() {
  const proposal = node(doc("proposal", "accepted", { acceptedAt: at("2026-07-09T11:00:00Z") }), null, 5_200_00);
  const contract = node(doc("contract", "signed", { signedAt: at("2026-07-14T14:32:00Z") }), null, 5_200_00);
  const deposit = node(
    doc("invoice", "paid"),
    invoice("deposit", 1_560_00, 1_560_00),
    1_560_00,
  );
  return { proposal, contract, deposit, nodes: [proposal, contract, deposit] };
}

describe("compareChainNodes", () => {
  it("orders proposal, contract, then invoices — deposit before balance", () => {
    const { proposal, contract, deposit } = chain();
    const balance = node(doc("invoice", "sent"), invoice("balance", 3_640_00, 0), 3_640_00);
    const shuffled = [balance, deposit, proposal, contract];
    const sorted = [...shuffled].sort(compareChainNodes);
    assert.deepEqual(
      sorted.map((n) => `${n.document.type}:${n.invoice?.kind ?? "-"}`),
      ["proposal:-", "contract:-", "invoice:deposit", "invoice:balance"],
    );
  });
});

describe("chainMoney", () => {
  it("reports the signed engagement, what is in, and what is out", () => {
    const { nodes } = chain();
    const balance = node(doc("invoice", "overdue"), invoice("balance", 3_640_00, 1_000_00), 3_640_00);
    const money = chainMoney([...nodes, balance]);
    assert.equal(money.engagement, 5_200_00, "the contract is the engagement value");
    assert.equal(money.collected, 1_560_00 + 1_000_00);
    assert.equal(money.outstanding, 3_640_00 - 1_000_00);
  });

  it("ignores voided invoices on both sides", () => {
    const { nodes } = chain();
    const voided = node(doc("invoice", "void"), invoice("balance", 3_640_00, 0), 3_640_00);
    const money = chainMoney([...nodes, voided]);
    assert.equal(money.outstanding, 0);
    assert.equal(money.collected, 1_560_00);
  });
});

describe("chainAction", () => {
  it("asks for the unsent document first", () => {
    const proposal = node(doc("proposal", "draft"), null, 5_200_00);
    assert.equal(chainAction([proposal])?.label, "Send proposal");

    const accepted = node(doc("proposal", "accepted"), null, 5_200_00);
    const draftContract = node(doc("contract", "draft"), null, 5_200_00);
    assert.equal(chainAction([accepted, draftContract])?.label, "Send contract for signature");
  });

  it("nudges an overdue invoice by name", () => {
    const { nodes } = chain();
    const late = node(
      doc("invoice", "overdue"),
      invoice("balance", 3_640_00, 0, { number: "INV-024" }),
      3_640_00,
    );
    assert.equal(chainAction([...nodes, late])?.label, "Remind — INV-024");
  });

  it("offers the balance invoice once the contract is signed", () => {
    const { nodes } = chain();
    assert.equal(chainAction(nodes)?.label, "Invoice the balance");
  });

  it("does not offer a balance invoice when the whole amount is already invoiced", () => {
    // The free-plan shape: signing raised one invoice for the full total.
    const proposal = node(doc("proposal", "accepted"), null, 4_620_00);
    const contract = node(doc("contract", "signed"), null, 4_620_00);
    const full = node(doc("invoice", "paid"), invoice("standalone", 4_620_00, 4_620_00), 4_620_00);
    assert.equal(chainAction([proposal, contract, full]), null, "nothing left to bill");
  });

  it("has nothing to say when a chain is settled", () => {
    const proposal = node(doc("proposal", "accepted"), null, 5_200_00);
    const contract = node(doc("contract", "signed"), null, 5_200_00);
    const deposit = node(doc("invoice", "paid"), invoice("deposit", 1_560_00, 1_560_00), 1_560_00);
    const balance = node(doc("invoice", "paid"), invoice("balance", 3_640_00, 3_640_00), 3_640_00);
    assert.equal(chainAction([proposal, contract, deposit, balance]), null);
  });
});

describe("recentlyChangedId", () => {
  it("finds the node whose status landed in the last minute", () => {
    const contract = node(
      doc("contract", "signed", { signedAt: new Date(NOW.getTime() - 20_000) }),
      null,
      5_200_00,
    );
    assert.equal(recentlyChangedId([contract], NOW), contract.document.id);
  });

  it("prefers the newest change when two land together", () => {
    const contract = node(
      doc("contract", "signed", { signedAt: new Date(NOW.getTime() - 30_000) }),
      null,
      5_200_00,
    );
    const deposit = node(
      doc("invoice", "sent", { createdAt: new Date(NOW.getTime() - 5_000) }),
      invoice("deposit", 1_560_00, 0, { paidAt: null }),
      1_560_00,
    );
    assert.equal(recentlyChangedId([contract, deposit], NOW), deposit.document.id);
  });

  it("stays quiet for history — no animation on an old chain", () => {
    const { nodes } = chain();
    assert.equal(recentlyChangedId(nodes, NOW), undefined);
  });
});

describe("lastCompleteIndex", () => {
  it("stops the solid thread at the last node the client acted on", () => {
    const { nodes } = chain();
    const balance = node(doc("invoice", "sent"), invoice("balance", 3_640_00, 0), 3_640_00);
    assert.equal(lastCompleteIndex([...nodes, balance]), 2, "the paid deposit is the last one done");
  });

  it("is -1 when nothing has happened yet", () => {
    assert.equal(lastCompleteIndex([node(doc("proposal", "sent"), null, 100)]), -1);
  });
});
