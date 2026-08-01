import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applySelections,
  blocksWithSelections,
  canTransition,
  documentTotals,
  pricingLines,
  pruneUnselected,
  sealVariant,
  statusLabel,
} from "@/lib/documents";
import type { BlockContent, DocumentStatus, DocumentType, LineItem } from "@/db/schema";

const ALL_STATUSES: DocumentStatus[] = [
  "draft",
  "sent",
  "viewed",
  "accepted",
  "signed",
  "paid",
  "overdue",
  "void",
];

function line(partial: Partial<LineItem> & { id: string }): LineItem {
  return {
    description: "Work",
    quantity: 1,
    unitAmount: 100_00,
    optional: false,
    selected: true,
    taxable: true,
    ...partial,
  };
}

const PROPOSAL_BLOCKS: { kind: "heading" | "text" | "pricing_table"; position: number; content: BlockContent }[] = [
  { kind: "heading", position: 0, content: { kind: "heading", text: "What we're building" } },
  {
    kind: "pricing_table",
    position: 1,
    content: {
      kind: "pricing_table",
      caption: "Fees",
      lines: [
        line({ id: "base", description: "Design and build", unitAmount: 4_400_00 }),
        line({ id: "copy", description: "Copywriting", unitAmount: 800_00, optional: true, selected: false }),
        line({ id: "care", description: "Aftercare", unitAmount: 600_00, optional: true, selected: false }),
      ],
    },
  },
];

describe("canTransition", () => {
  it("walks a proposal to acceptance", () => {
    assert.equal(canTransition("proposal", "draft", "sent"), true);
    assert.equal(canTransition("proposal", "sent", "viewed"), true);
    assert.equal(canTransition("proposal", "viewed", "accepted"), true);
    assert.equal(canTransition("proposal", "sent", "accepted"), true);
  });

  it("walks a contract to signature", () => {
    assert.equal(canTransition("contract", "draft", "sent"), true);
    assert.equal(canTransition("contract", "viewed", "signed"), true);
  });

  it("walks an invoice through overdue to paid", () => {
    assert.equal(canTransition("invoice", "sent", "overdue"), true);
    assert.equal(canTransition("invoice", "overdue", "paid"), true);
    assert.equal(canTransition("invoice", "sent", "paid"), true);
  });

  it("refuses moves that belong to another type", () => {
    assert.equal(canTransition("proposal", "sent", "signed"), false);
    assert.equal(canTransition("proposal", "sent", "paid"), false);
    assert.equal(canTransition("contract", "sent", "accepted"), false);
    assert.equal(canTransition("invoice", "sent", "signed"), false);
  });

  it("refuses to go backwards", () => {
    assert.equal(canTransition("proposal", "accepted", "sent"), false);
    assert.equal(canTransition("contract", "signed", "sent"), false);
    assert.equal(canTransition("invoice", "paid", "overdue"), false);
    assert.equal(canTransition("invoice", "overdue", "sent"), false);
  });

  it("refuses a no-op", () => {
    for (const type of ["proposal", "contract", "invoice"] as DocumentType[]) {
      for (const status of ALL_STATUSES) {
        assert.equal(canTransition(type, status, status), false, `${type} ${status}`);
      }
    }
  });

  it("lets anything unsettled be voided, and nothing leave void or paid", () => {
    assert.equal(canTransition("contract", "signed", "void"), true);
    assert.equal(canTransition("invoice", "overdue", "void"), true);
    assert.equal(canTransition("invoice", "paid", "void"), false);
    for (const type of ["proposal", "contract", "invoice"] as DocumentType[]) {
      for (const to of ALL_STATUSES) {
        assert.equal(canTransition(type, "void", to), false, `void → ${to}`);
        assert.equal(canTransition(type, "paid", to), false, `paid → ${to}`);
      }
    }
  });
});

describe("status presentation", () => {
  it("names statuses the way the document type reads", () => {
    assert.equal(statusLabel("proposal", "accepted"), "Accepted");
    assert.equal(statusLabel("contract", "signed"), "Signed");
    assert.equal(statusLabel("invoice", "paid"), "Paid");
    assert.equal(statusLabel("invoice", "overdue"), "Overdue");
    assert.equal(statusLabel("proposal", "draft"), "Draft");
  });

  it("maps statuses to the seal-chip variants in DESIGN.md", () => {
    assert.equal(sealVariant("draft"), "draft");
    assert.equal(sealVariant("sent"), "sent");
    assert.equal(sealVariant("viewed"), "sent");
    assert.equal(sealVariant("accepted"), "signed");
    assert.equal(sealVariant("signed"), "signed");
    assert.equal(sealVariant("paid"), "paid");
    assert.equal(sealVariant("overdue"), "overdue");
    assert.equal(sealVariant("void"), "void");
  });
});

describe("pricing blocks", () => {
  it("collects every line across every pricing table", () => {
    assert.equal(pricingLines(PROPOSAL_BLOCKS).length, 3);
  });

  it("totals only what is selected", () => {
    assert.equal(documentTotals(PROPOSAL_BLOCKS, 0).total, 4_400_00);
  });

  it("adds tax on top of the selected subtotal", () => {
    assert.equal(documentTotals(PROPOSAL_BLOCKS, 2000).total, 5_280_00);
  });
});

describe("applySelections", () => {
  it("takes the add-ons the client ticked", () => {
    const lines = applySelections(pricingLines(PROPOSAL_BLOCKS), ["copy"]);
    assert.deepEqual(
      lines.map((l) => [l.id, l.selected]),
      [
        ["base", true],
        ["copy", true],
        ["care", false],
      ],
    );
  });

  it("cannot be used to deselect a required row", () => {
    const lines = applySelections(pricingLines(PROPOSAL_BLOCKS), []);
    assert.equal(lines.find((l) => l.id === "base")!.selected, true);
  });

  it("ignores ids that are not on the document", () => {
    const lines = applySelections(pricingLines(PROPOSAL_BLOCKS), ["copy", "not-a-line", "'; drop table"]);
    assert.equal(lines.filter((l) => l.selected).length, 2);
  });

  it("does not mutate the original lines", () => {
    const before = pricingLines(PROPOSAL_BLOCKS);
    applySelections(before, ["copy", "care"]);
    assert.equal(before.find((l) => l.id === "copy")!.selected, false);
  });
});

describe("snapshotting for the contract", () => {
  it("keeps the accepted total intact through the snapshot", () => {
    const accepted = blocksWithSelections(PROPOSAL_BLOCKS, ["copy"]);
    assert.equal(documentTotals(accepted, 0).total, 5_200_00);
    const contract = pruneUnselected(accepted);
    assert.equal(documentTotals(contract, 0).total, 5_200_00);
  });

  it("drops rejected add-ons so the contract reads as the deal struck", () => {
    const contract = pruneUnselected(blocksWithSelections(PROPOSAL_BLOCKS, ["copy"]));
    const lines = pricingLines(contract);
    assert.deepEqual(lines.map((l) => l.id), ["base", "copy"]);
    // Nothing is left optional: there is nothing left to choose.
    assert.ok(lines.every((l) => !l.optional && l.selected));
  });

  it("keeps non-pricing blocks untouched", () => {
    const contract = pruneUnselected(blocksWithSelections(PROPOSAL_BLOCKS, []));
    assert.deepEqual(contract[0].content, { kind: "heading", text: "What we're building" });
  });

  it("is stable when the client accepts everything", () => {
    const contract = pruneUnselected(blocksWithSelections(PROPOSAL_BLOCKS, ["copy", "care"]));
    assert.equal(documentTotals(contract, 0).total, 5_800_00);
    assert.equal(pricingLines(contract).length, 3);
  });
});
