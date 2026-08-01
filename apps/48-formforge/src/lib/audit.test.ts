/**
 * The audit log's PHI allowlist.
 *
 * `metadata` is the one free-form field on an audit row, which makes it the one
 * place a patient's name can end up in a table that is, by design, impossible to
 * delete from. So the filter is an allowlist and these tests are the allowlist:
 * anything not named is dropped before the insert, whatever the caller passes.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ALLOWED_METADATA_KEYS, auditCsv, auditVerb, filterActions, sanitizeMetadata } from "@/lib/audit-policy";
import type { AuditEvent } from "@/db/schema";

describe("sanitizeMetadata", () => {
  it("keeps the allowlisted keys", () => {
    const { metadata, dropped } = sanitizeMetadata({ fields: 4, channel: "email", step: 1 });
    assert.deepEqual(metadata, { fields: 4, channel: "email", step: 1 });
    assert.deepEqual(dropped, []);
  });

  it("drops anything that could carry PHI, whatever it is called", () => {
    const { metadata, dropped } = sanitizeMetadata({
      count: 3,
      patientName: "Dana Okonkwo",
      email: "dana@example.com",
      dob: "1988-04-12",
      answer: "panic attacks since March",
      note: "seems anxious",
      diagnosis: "GAD",
    });
    assert.deepEqual(metadata, { count: 3 });
    assert.deepEqual(dropped.sort(), ["answer", "diagnosis", "dob", "email", "note", "patientName"]);
  });

  it("drops values that are not scalars — an object could nest anything", () => {
    const { metadata, dropped } = sanitizeMetadata({
      count: 1,
      // @ts-expect-error deliberately wrong shape
      filter: { patient: "Dana" },
    });
    assert.deepEqual(metadata, { count: 1 });
    assert.deepEqual(dropped, ["filter"]);
  });

  it("truncates a long string rather than storing an essay", () => {
    const { metadata } = sanitizeMetadata({ reason: "x".repeat(400) });
    assert.equal((metadata!.reason as string).length, 120);
    assert.match(metadata!.reason as string, /\.\.\.$/);
  });

  it("returns null rather than an empty object when nothing survives", () => {
    assert.equal(sanitizeMetadata({ patientName: "Dana" }).metadata, null);
    assert.equal(sanitizeMetadata(null).metadata, null);
    assert.equal(sanitizeMetadata(undefined).metadata, null);
  });

  it("keeps booleans and zero, which a naive truthiness filter would eat", () => {
    const { metadata } = sanitizeMetadata({ flagged: false, count: 0 });
    assert.deepEqual(metadata, { flagged: false, count: 0 });
  });

  it("has an allowlist with no obviously identifying key on it", () => {
    const suspicious = ["name", "email", "phone", "dob", "patient", "answer", "note", "address"];
    for (const key of suspicious) {
      assert.ok(!ALLOWED_METADATA_KEYS.includes(key as never), `"${key}" must not be allowlisted`);
    }
  });
});

describe("filter chips", () => {
  it("maps DESIGN.md's four chips onto actions, with all meaning no filter", () => {
    assert.equal(filterActions("all"), null);
    assert.deepEqual(filterActions("views"), ["viewed"]);
    assert.deepEqual(filterActions("exports"), ["exported"]);
    assert.deepEqual(filterActions("sends"), ["sent", "reminded"]);
    // "Edits" covers everything that changed state, including a signature.
    assert.deepEqual(filterActions("edits"), ["edited", "published", "signed", "deleted"]);
  });

  it("renders the verb in DESIGN.md's uppercase mono form", () => {
    assert.equal(auditVerb("viewed"), "VIEWED");
    assert.equal(auditVerb("reminded"), "REMINDED");
  });
});

describe("auditCsv", () => {
  const row: AuditEvent = {
    id: "a1",
    practiceId: "p1",
    actorType: "user",
    actorId: "u1",
    actorLabel: 'Dana Reyes, "front desk"',
    action: "exported",
    targetType: "intake",
    targetId: "i1",
    targetLabel: "packet PDF",
    ip: "73.92.1.8",
    metadata: { bytes: 20481, kind: "packet_pdf" },
    createdAt: new Date("2026-07-04T14:02:11Z"),
  } as AuditEvent;

  it("writes a header and one row per event", () => {
    const csv = auditCsv([row]);
    const lines = csv.trim().split("\n");
    assert.equal(lines.length, 2);
    assert.match(lines[0], /^timestamp_utc,action,actor_type,actor,actor_id/);
  });

  it("quotes and escapes a field containing a comma or a quote", () => {
    const csv = auditCsv([row]);
    assert.ok(csv.includes('"Dana Reyes, ""front desk"""'));
  });

  it("serialises metadata as JSON in one column", () => {
    assert.ok(auditCsv([row]).includes('"{""bytes"":20481,""kind"":""packet_pdf""}"'));
  });

  it("produces a header-only file for an empty log rather than nothing", () => {
    assert.equal(auditCsv([]).trim().split("\n").length, 1);
  });
});
