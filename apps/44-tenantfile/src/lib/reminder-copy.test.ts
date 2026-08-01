/**
 * Reminder copy is tested because tone is a product requirement here, not a
 * nicety: these messages arrive on a tenant's phone about money, and README's
 * differentiation rests on TenantFile being the landlord-paid, non-adversarial
 * option. A late notice that threatens is a defect.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reminderCopy, templateLabel, type ReminderContext } from "@/lib/reminder-copy";

const ctx: ReminderContext = {
  tenantFirstName: "Marta",
  landlordName: "Ray Doyle",
  addressLine: "114 Maple Street",
  unitLabel: "2B",
  amountDueCents: 185_000,
  balanceCents: 190_000,
  dueOn: "2026-09-01",
  daysLate: 6,
  lateFeeCents: 5_000,
  payUrl: "https://tenantfile.app/t/abc123",
};

const ALL = ["upcoming", "due", "late_1", "late_2"] as const;

describe("reminder copy", () => {
  it("always states the amount and links the pay page", () => {
    for (const template of ALL) {
      const copy = reminderCopy(template, ctx);
      const text = [copy.subject, copy.heading, ...copy.paragraphs].join(" ");
      assert.match(text, /1,850\.00|1,900\.00/, `${template} must name an amount`);
      assert.match(copy.sms, /tenantfile\.app\/t\/abc123/, `${template} SMS must carry the link`);
    }
  });

  it("never threatens, in any variant", () => {
    for (const template of ALL) {
      const copy = reminderCopy(template, ctx);
      const text = [copy.subject, copy.heading, copy.sms, ...copy.paragraphs].join(" ");
      assert.doesNotMatch(text, /evict|eviction|court|attorney|lawyer|legal action|sheriff|lock/i, template);
      assert.doesNotMatch(text, /immediately|final notice|failure to comply/i, template);
    }
  });

  it("uses no emoji, per the design language", () => {
    for (const template of ALL) {
      const copy = reminderCopy(template, ctx);
      const text = [copy.subject, copy.heading, copy.sms, ...copy.paragraphs].join(" ");
      assert.doesNotMatch(text, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, template);
    }
  });

  it("keeps SMS short enough not to split", () => {
    for (const template of ALL) {
      const { sms } = reminderCopy(template, ctx);
      assert.ok(sms.length <= 160, `${template} SMS is ${sms.length} characters: ${sms}`);
    }
  });

  it("gives the upcoming notice an out for people who already paid", () => {
    const copy = reminderCopy("due", ctx);
    assert.match(copy.paragraphs.join(" "), /already sent it/);
  });

  it("mentions a late fee only when one was actually charged", () => {
    const withFee = reminderCopy("late_1", ctx).paragraphs.join(" ");
    assert.match(withFee, /late fee of \$50\.00/);
    const withoutFee = reminderCopy("late_1", { ...ctx, lateFeeCents: 0 }).paragraphs.join(" ");
    assert.match(withoutFee, /No late fee has been added yet/);
  });

  it("counts days correctly in the singular", () => {
    const one = reminderCopy("late_1", { ...ctx, daysLate: 1 });
    assert.match(one.subject, /1 day past due/);
    assert.match(one.sms, /1 day past due/);
    const many = reminderCopy("late_1", { ...ctx, daysLate: 6 });
    assert.match(many.subject, /6 days past due/);
  });

  it("escalates in firmness, not in threat", () => {
    const first = reminderCopy("late_1", ctx).paragraphs.join(" ");
    const second = reminderCopy("late_2", ctx).paragraphs.join(" ");
    assert.match(first, /I would rather know than guess/);
    assert.match(second, /I need to hear from you this week/);
    assert.match(second, /Part payments are recorded and they help/);
  });

  it("signs every message from the landlord, never from TenantFile", () => {
    for (const template of ALL) {
      const copy = reminderCopy(template, ctx);
      assert.ok(copy.paragraphs.some((p) => p.includes("Ray Doyle")), template);
      assert.ok(!copy.paragraphs.some((p) => /TenantFile/.test(p)), template);
    }
  });

  it("survives a tenant with no first name on file", () => {
    const copy = reminderCopy("due", { ...ctx, tenantFirstName: "" });
    assert.ok(copy.paragraphs[0].startsWith("Hi"));
  });

  it("labels templates for the landlord's reminder list", () => {
    assert.equal(templateLabel("upcoming"), "Heads-up before due date");
    assert.equal(templateLabel("late_2"), "Second late notice");
  });
});
