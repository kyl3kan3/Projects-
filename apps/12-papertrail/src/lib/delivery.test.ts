import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coveringNote, documentUrl, stampLine } from "@/lib/delivery";
import { textToHtml } from "@/lib/email";
import type { Brand, Client, DocumentRow } from "@/db/schema";

const at = (iso: string) => new Date(iso);

const client: Client = {
  id: "client-1",
  userId: "user-1",
  name: "Rosa Álvarez",
  email: "rosa@meridiancoffee.example",
  company: "Meridian Coffee",
  notes: "",
  createdAt: at("2026-07-01T09:00:00Z"),
};

const brand: Brand = {
  id: "brand-1",
  userId: "user-1",
  name: "Ada Mwangi Design",
  logoUrl: null,
  accentColor: "#14213D",
  businessDetails: "14 Ridgeway, Nairobi",
  senderDomain: null,
  senderDomainVerified: false,
  isDefault: true,
  createdAt: at("2026-07-01T09:00:00Z"),
};

function document(type: DocumentRow["type"], overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: "doc-1",
    userId: "user-1",
    brandId: brand.id,
    clientId: client.id,
    type,
    status: "draft",
    title: "Website redesign — Meridian Coffee",
    parentDocumentId: null,
    publicToken: "Zm9vYmFyYmF6cXV1eDEyMzQ1Njc4",
    currency: "USD",
    taxRateBps: 0,
    taxLabel: "Tax",
    depositPercent: 30,
    netDays: 14,
    sentAt: null,
    firstViewedAt: null,
    acceptedAt: null,
    signedAt: null,
    voidedAt: null,
    expiresAt: null,
    createdAt: at("2026-07-04T09:00:00Z"),
    updatedAt: at("2026-07-04T09:00:00Z"),
    ...overrides,
  };
}

const base = {
  client,
  brand,
  freelancerName: "Ada Mwangi",
  freelancerEmail: "ada@mwangi.design",
  total: 5_200_00,
};

describe("coveringNote", () => {
  it("links the client sheet and quotes the total", () => {
    const note = coveringNote({ ...base, document: document("proposal"), planId: "solo" });
    assert.match(note.subject, /^Proposal — Website redesign/);
    assert.match(note.body, /\$5,200\.00/);
    assert.match(note.body, new RegExp(documentUrl("Zm9vYmFyYmF6cXV1eDEyMzQ1Njc4").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(note.body, /Rosa Álvarez/);
  });

  it("tells the client what signing will trigger", () => {
    const note = coveringNote({ ...base, document: document("contract"), planId: "solo" });
    assert.match(note.subject, /Contract for signature/);
    assert.match(note.body, /30% deposit invoice straight away/);
  });

  it("says the full amount is invoiced on completion when there is no deposit", () => {
    const note = coveringNote({
      ...base,
      document: document("contract", { depositPercent: 0 }),
      planId: "solo",
    });
    assert.match(note.body, /full amount is invoiced on completion/);
  });

  it("puts the number, amount and due date in an invoice subject and body", () => {
    const note = coveringNote({
      ...base,
      document: document("invoice", { status: "sent" }),
      planId: "solo",
      invoiceNumber: "INV-023",
      dueAt: at("2100-01-01T23:59:59.999Z"),
      total: 1_560_00,
    });
    assert.match(note.subject, /^INV-023 — \$1,560\.00/);
    assert.match(note.body, /INV-023/);
    assert.match(note.body, /due Jan 1/);
  });

  it("carries the PaperTrail line on the free plan only", () => {
    const free = coveringNote({ ...base, document: document("proposal"), planId: "free" });
    const solo = coveringNote({ ...base, document: document("proposal"), planId: "solo" });
    assert.match(free.body, /Sent with PaperTrail/);
    assert.doesNotMatch(solo.body, /Sent with PaperTrail/);
  });
});

describe("textToHtml", () => {
  it("keeps paragraphs and links the URL", () => {
    const html = textToHtml("Hi Rosa,\n\nHere it is: https://papertrail.app/d/abc\n\nAda");
    assert.equal((html.match(/<p /g) ?? []).length, 3);
    assert.match(html, /<a href="https:\/\/papertrail\.app\/d\/abc"/);
  });

  it("escapes anything that looks like markup — a client name is not HTML", () => {
    const html = textToHtml('Hi <script>alert("x")</script>');
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;/);
  });

  it("turns single newlines into breaks, not new paragraphs", () => {
    const html = textToHtml("Thanks,\nAda");
    assert.equal((html.match(/<p /g) ?? []).length, 1);
    assert.match(html, /Thanks,<br>Ada/);
  });
});

describe("stampLine", () => {
  it("reads the furthest thing that happened", () => {
    assert.equal(stampLine(document("contract", { signedAt: at("2026-07-14T09:00:00Z") })), "Signed Jul 14");
    assert.equal(
      stampLine(document("proposal", { acceptedAt: at("2026-07-09T09:00:00Z") })),
      "Accepted Jul 9",
    );
    assert.equal(stampLine(document("proposal", { sentAt: at("2026-07-04T09:00:00Z") })), "Sent Jul 4");
    assert.equal(stampLine(document("proposal")), "Draft");
  });
});
