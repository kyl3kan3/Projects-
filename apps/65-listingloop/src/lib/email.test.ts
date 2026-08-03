/**
 * The email seam. There is no Resend key in this environment, so the live send is
 * unexercised by design — what is tested is the part that decides whether
 * anything leaves the box, and what the caller is told when it does not. The
 * reminder ledger is written on the dry-run path too, so exactly-once behaviour
 * is identical either way; that is what makes this seam worth having.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { clearDryRunOutbox, dryRunOutbox, sendEmail } from "@/lib/email";
import { emailConfigured } from "@/lib/env";

test("with no provider configured, nothing is sent and the caller is told", async () => {
  delete process.env.RESEND_API_KEY;
  process.env.DRY_RUN = "0";
  clearDryRunOutbox();
  assert.equal(emailConfigured(), false);

  const result = await sendEmail({
    to: "dana.okafor@example.test",
    subject: "Inspection objection deadline — in 3 days",
    text: "Dana,\n\nOne date on your transaction is coming up.\n",
  });
  assert.deepEqual(result, { delivered: false, dryRun: true, id: null, error: null });
  assert.equal(dryRunOutbox().length, 1);
  assert.equal(dryRunOutbox()[0].to, "dana.okafor@example.test");
  assert.match(dryRunOutbox()[0].subject, /Inspection objection/);
});

test("DRY_RUN=1 wins even with a key present", async () => {
  process.env.RESEND_API_KEY = "not-a-real-key";
  process.env.DRY_RUN = "1";
  clearDryRunOutbox();
  assert.equal(emailConfigured(), false, "DRY_RUN overrides a configured provider");

  const result = await sendEmail({ to: "a@example.test", subject: "s", text: "t" });
  assert.equal(result.dryRun, true);
  assert.equal(result.delivered, false);
  assert.equal(dryRunOutbox().length, 1);

  delete process.env.RESEND_API_KEY;
  process.env.DRY_RUN = "1";
});

test("the outbox can be cleared between passes", () => {
  clearDryRunOutbox();
  assert.equal(dryRunOutbox().length, 0);
});
