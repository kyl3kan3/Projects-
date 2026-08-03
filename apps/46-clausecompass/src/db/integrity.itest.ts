/**
 * Database-backed integration tests — `npm run test:db`.
 *
 * These need a real Postgres (DATABASE_URL) because what they check *is* the database:
 * the CHECK constraint that makes an unanchored clause unstorable, the unique index that
 * stops a re-scored contract double-flagging, the credit ledger under a refund, and the
 * report-completeness invariant across the whole pipeline.
 *
 * Kept out of `npm test` deliberately: the unit suite must run with no infrastructure.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import "@/lib/load-env";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import {
  accounts,
  clauses,
  contracts,
  flags,
  purchases,
  users,
  type Account,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { creditBalance, grantCredits, NoCreditsError, refundCredit, reserveCredit } from "@/lib/billing";
import { assembleReport, createReview, deleteContract } from "@/lib/contracts";
import { runToCompletion } from "@/lib/pipeline";
import { ensureDefaultPlaybook } from "@/lib/playbook-store";
import { createShareLink, renderReportPdf, reportFromShareToken, revokeShareLink } from "@/lib/reports";
import { FIXTURES } from "@/fixtures/contracts";

const EMAIL = "itest-46@example.com";
let account: Account;

before(async () => {
  const db = getDb();
  await ensureDefaultPlaybook();
  const [existing] = await db.select().from(users).where(eq(users.email, EMAIL));
  if (existing) await db.delete(accounts).where(eq(accounts.id, existing.accountId));
  const [created] = await db
    .insert(accounts)
    .values({ name: "Integration Test", plan: "freelancer", disclaimerAckAt: new Date() })
    .returning();
  account = created;
  await db.insert(users).values({
    accountId: account.id,
    email: EMAIL,
    name: "Integration Test",
    passwordHash: await hashPassword("password12345"),
  });
});

after(async () => {
  const db = getDb();
  await db.delete(accounts).where(eq(accounts.id, account.id));
  await closeDb();
});

test("a clause with no source spans cannot be stored", async () => {
  const db = getDb();
  const [contract] = await db
    .insert(contracts)
    .values({
      accountId: account.id,
      title: "Constraint probe",
      sourceKind: "text",
      sha256: `probe-${Date.now()}`,
      retentionExpiresAt: new Date(Date.now() + 86_400_000),
    })
    .returning();
  await assert.rejects(
    db.insert(clauses).values({
      contractId: contract.id,
      clauseType: "payment_terms",
      sourceSpans: [],
      modelVersion: "test",
    }),
    /source_spans/,
  );
  await db.delete(contracts).where(eq(contracts.id, contract.id));
});

test("credits are spent soonest-expiry-first and returned by a refund", async () => {
  const db = getDb();
  await db.delete(purchases).where(eq(purchases.accountId, account.id));
  const soon = new Date(Date.now() + 3 * 86_400_000);
  await grantCredits({
    accountId: account.id,
    kind: "subscription_grant",
    credits: 1,
    stripeRef: `itest-monthly-${Date.now()}`,
    expiresAt: soon,
  });
  await grantCredits({
    accountId: account.id,
    kind: "one_time",
    credits: 1,
    amountCents: 1900,
    stripeRef: `itest-onetime-${Date.now()}`,
  });
  assert.equal(await creditBalance(account.id), 2);

  const [contract] = await db
    .insert(contracts)
    .values({
      accountId: account.id,
      title: "Ledger probe",
      sourceKind: "text",
      sha256: `ledger-${Date.now()}`,
      retentionExpiresAt: new Date(Date.now() + 86_400_000),
    })
    .returning();

  const usedId = await reserveCredit(account.id, contract.id);
  const [used] = await db.select().from(purchases).where(eq(purchases.id, usedId));
  assert.equal(used.kind, "subscription_grant", "the expiring credit is spent before the paid one");
  assert.equal(await creditBalance(account.id), 1);

  assert.equal(await refundCredit(contract.id), true);
  assert.equal(await creditBalance(account.id), 2);
  assert.equal(await refundCredit(contract.id), false, "a second refund is a no-op");

  // Spend both, then prove the third attempt is refused rather than going negative.
  await reserveCredit(account.id, contract.id);
  const [second] = await db
    .insert(contracts)
    .values({
      accountId: account.id,
      title: "Ledger probe 2",
      sourceKind: "text",
      sha256: `ledger2-${Date.now()}`,
      retentionExpiresAt: new Date(Date.now() + 86_400_000),
    })
    .returning();
  await reserveCredit(account.id, second.id);
  assert.equal(await creditBalance(account.id), 0);
  await assert.rejects(reserveCredit(account.id, second.id), NoCreditsError);

  await db.delete(contracts).where(eq(contracts.id, contract.id));
  await db.delete(contracts).where(eq(contracts.id, second.id));
});

test("an upload with no credits leaves nothing behind", async () => {
  const db = getDb();
  await db.delete(purchases).where(eq(purchases.accountId, account.id));
  const before = await db.select().from(contracts).where(eq(contracts.accountId, account.id));
  await assert.rejects(
    createReview({ account, actor: "itest", source: { kind: "text", text: FIXTURES[1].text } }),
    NoCreditsError,
  );
  const after = await db.select().from(contracts).where(eq(contracts.accountId, account.id));
  assert.equal(after.length, before.length, "the half-created contract must be rolled back");
});

test("the full pipeline produces a complete, anchored, shareable report", async () => {
  const db = getDb();
  await grantCredits({
    accountId: account.id,
    kind: "one_time",
    credits: 2,
    amountCents: 3800,
    stripeRef: `itest-pipeline-${Date.now()}`,
  });

  const fixture = FIXTURES[0];
  const created = await createReview({
    account,
    actor: "itest",
    source: { kind: "text", text: fixture.text },
  });
  const progress = await runToCompletion(created.contractId);
  assert.equal(progress.status, "ready", progress.detail);

  const [contract] = await db.select().from(contracts).where(eq(contracts.id, created.contractId));
  const view = await assembleReport(contract);

  // Completeness: every clause row and every flag row appears in the report.
  const clauseRows = await db.select().from(clauses).where(eq(clauses.contractId, contract.id));
  const flagRows = await db.select().from(flags).where(eq(flags.contractId, contract.id));
  const renderedClauses = view.rows.filter((r) => r.kind === "clause").length;
  const renderedFlags = view.rows.flatMap((r) => r.flags).length;
  assert.equal(renderedClauses, clauseRows.length, "every clause must render");
  assert.equal(renderedFlags, flagRows.length, "every flag must render");

  // Anchoring: every rendered quote is the document's own text.
  const [text] = await db
    .select()
    .from(contracts)
    .where(eq(contracts.id, contract.id));
  assert.ok(text);
  for (const row of view.rows) {
    if (row.kind !== "clause") continue;
    assert.ok(row.quote && row.quote.length > 10, `${row.label} must carry a quote`);
    assert.ok(row.citation, `${row.label} must carry a citation`);
  }

  // Every flag has an explanation and a redline, and HIGH flags carry the pointer.
  for (const { flag, redline } of view.rows.flatMap((r) => r.flags)) {
    assert.ok(flag.explanation, `${flag.ruleKey} has no explanation`);
    assert.ok(flag.forYou, `${flag.ruleKey} has no "for you"`);
    assert.ok(redline, `${flag.ruleKey} has no redline`);
    assert.ok(redline.suggestedText.length > 30);
    if (flag.severity === "high") assert.equal(flag.lawyerPointer, true);
  }

  // Hand-labelled flags all fired.
  const firedKeys = view.rows.flatMap((r) => r.flags.map((f) => f.flag.ruleKey)).sort();
  assert.deepEqual(firedKeys, [...fixture.expectedFlags].sort());

  // Re-running a finished stage must not duplicate anything.
  await runToCompletion(created.contractId);
  const flagsAfter = await db.select().from(flags).where(eq(flags.contractId, contract.id));
  assert.equal(flagsAfter.length, flagRows.length, "a re-run must not double-flag");

  // The PDF renders, has more than one page, and every page carries the banner.
  const pdf = await renderReportPdf(view);
  assert.ok(pdf.byteLength > 3000, "the PDF should have real content");
  const asString = Buffer.from(pdf).toString("latin1");
  assert.match(asString, /^%PDF-/);

  // Share links: mint, resolve, revoke, and stay revoked.
  const token = await createShareLink(contract.id, "itest");
  const shared = await reportFromShareToken(token);
  assert.ok(shared, "a minted share token must resolve");
  assert.equal(shared.contract.id, contract.id);
  await revokeShareLink(contract.id, "itest");
  assert.equal(await reportFromShareToken(token), null, "a revoked token must stop working");

  // Deleting a finished review keeps the credit spent and removes everything derived.
  await deleteContract(account.id, contract.id, "itest");
  const remaining = await db.select().from(clauses).where(eq(clauses.contractId, contract.id));
  assert.equal(remaining.length, 0, "clauses must be deleted with the contract");
});

test("a failed review refunds its credit and says why", async () => {
  const db = getDb();
  await grantCredits({
    accountId: account.id,
    kind: "one_time",
    credits: 1,
    amountCents: 1900,
    stripeRef: `itest-fail-${Date.now()}`,
  });
  const balanceBefore = await creditBalance(account.id);

  const created = await createReview({
    account,
    actor: "itest",
    source: { kind: "text", text: FIXTURES[2].text },
  });
  // Simulate the failure mode the pipeline has to survive: the parsed text vanishing
  // between stages (a retention sweep, a bad migration, a manual deletion).
  await db.execute(`delete from contract_texts where contract_id = '${created.contractId}'`);
  const progress = await runToCompletion(created.contractId);

  assert.equal(progress.status, "failed");
  assert.match(progress.detail, /parsed text/i);
  assert.equal(await creditBalance(account.id), balanceBefore, "the credit must come back");

  const [contract] = await db.select().from(contracts).where(eq(contracts.id, created.contractId));
  assert.equal(contract.creditPurchaseId, null);
  await db.delete(contracts).where(eq(contracts.id, created.contractId));
});
