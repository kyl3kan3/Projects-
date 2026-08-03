import { test } from "node:test";
import assert from "node:assert/strict";
import { diffRaw } from "./index";
import { anchorFor, draftEntry, hasUnfilledMigrationNote, MIGRATION_PLACEHOLDER } from "./changelog";

const before = `openapi: 3.1.0
info: { title: Orders API, version: "1" }
paths:
  /v1/orders:
    get:
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                type: object
                required: [id, invoice_url]
                properties:
                  id: { type: string }
                  invoice_url: { type: string }
                  status: { type: string, enum: [open, paid, cancelled] }
`;

const breakingAfter = before
  .replace("required: [id, invoice_url]", "required: [id]")
  .replace("enum: [open, paid, cancelled]", "enum: [open, paid]");

const additiveAfter = before.replace(
  "                  id: { type: string }",
  "                  id: { type: string }\n                  receipt_url: { type: string }",
);

test("a breaking diff drafts an entry with migration slots the publisher must fill", async () => {
  const r = await diffRaw(before, breakingAfter);
  const entry = draftEntry({ fromLabel: "9f3c2ab", toLabel: "4d81e07", findings: r.findings });

  assert.equal(entry.breaking, true);
  assert.match(entry.title, /breaking changes in 4d81e07/);
  assert.equal(entry.anchor, "v-4d81e07");
  assert.match(entry.bodyMd, /## Breaking changes/);
  assert.match(entry.bodyMd, /### GET \/v1\/orders/);
  assert.match(entry.bodyMd, /Removed enum value `cancelled` from `status`/);
  assert.ok(hasUnfilledMigrationNote(entry.bodyMd));

  // One migration slot per breaking finding, not one per entry.
  const slots = entry.bodyMd.split(MIGRATION_PLACEHOLDER).length - 1;
  assert.equal(slots, r.summary.breaking);
});

test("a single breaking change gets a specific title, not a count", async () => {
  const oneChange = before.replace("enum: [open, paid, cancelled]", "enum: [open, paid]");
  const r = await diffRaw(before, oneChange);
  const entry = draftEntry({ fromLabel: "a", toLabel: "b", findings: r.findings });
  assert.equal(entry.title, "Breaking: Removed enum value cancelled from status");
});

test("an additive diff drafts a compatible entry with no migration slot", async () => {
  const r = await diffRaw(before, additiveAfter);
  const entry = draftEntry({ fromLabel: "9f3c2ab", toLabel: "4d81e07", findings: r.findings });
  assert.equal(entry.breaking, false);
  assert.equal(entry.title, "Additions in 4d81e07");
  assert.equal(hasUnfilledMigrationNote(entry.bodyMd), false);
  assert.match(entry.bodyMd, /## Compatible changes/);
});

test("a diff with no findings still drafts a readable, honest entry", () => {
  const entry = draftEntry({ fromLabel: "a", toLabel: "b", findings: [] });
  assert.equal(entry.title, "No API changes in b");
  assert.match(entry.bodyMd, /No changes to the public contract/);
  assert.equal(entry.breaking, false);
});

test("impacted consumers are named at the top when the registry knows them", async () => {
  const r = await diffRaw(before, breakingAfter);
  const entry = draftEntry({
    fromLabel: "a",
    toLabel: "b",
    findings: r.findings,
    impactedConsumers: ["Acme webhooks", "iOS app"],
  });
  assert.match(entry.bodyMd, /Affects: Acme webhooks, iOS app\./);
});

test("sections are ordered breaking, then review, then compatible", async () => {
  const mixed = breakingAfter.replace(
    "                  id: { type: string }",
    "                  id: { type: string }\n                  receipt_url: { type: string }",
  );
  const r = await diffRaw(before, mixed);
  const entry = draftEntry({ fromLabel: "a", toLabel: "b", findings: r.findings });
  const iBreaking = entry.bodyMd.indexOf("## Breaking changes");
  const iCompatible = entry.bodyMd.indexOf("## Compatible changes");
  assert.ok(iBreaking >= 0 && iCompatible > iBreaking);
});

test("anchors are stable and URL-safe for any version label", () => {
  assert.equal(anchorFor("4d81e07"), "v-4d81e07");
  assert.equal(anchorFor("v2.1.0"), "v-v2-1-0");
  assert.equal(anchorFor("release/2026-08-03"), "v-release-2026-08-03");
  assert.equal(anchorFor("!!!"), "v-release");
});
