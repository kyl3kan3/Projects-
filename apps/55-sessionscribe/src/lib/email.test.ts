/**
 * No PHI in email, proven twice.
 *
 * Once by content — the two messages the product sends are checked for the things
 * they must not contain — and once structurally: `lib/email.ts` cannot import a
 * client, note or transcript, so there is nothing PHI-shaped in scope for a
 * future edit to accidentally interpolate. Email is the one artifact that leaves
 * the encrypted perimeter for an inbox nobody here controls.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { draftReadyEmail, pipelineFailedEmail } from "@/lib/email";

const source = readFileSync(join(process.cwd(), "src/lib/email.ts"), "utf8");

describe("the draft-ready notification", () => {
  const message = draftReadyEmail("dana@practice.example", 3);

  it("says only that drafts are ready", () => {
    assert.equal(message.subject, "3 drafts ready for review");
    assert.match(message.text, /3 progress-note drafts are ready/);
    assert.match(message.text, /deliberately contains no client information/);
  });

  it("agrees with itself for a single draft", () => {
    const one = draftReadyEmail("dana@practice.example", 1);
    assert.equal(one.subject, "1 draft ready for review");
    assert.match(one.text, /1 progress-note draft is ready/);
  });

  it("carries no client label, session time, or note text — it cannot", () => {
    // The function's only inputs are an address and a count, so there is no
    // channel through which PHI could arrive. This asserts the shape stays that way.
    assert.equal(draftReadyEmail.length, 2);
    for (const forbidden of ["J.R.", "SOAP", "anxiety", "session at", "transcript"]) {
      assert.ok(
        !message.text.includes(forbidden),
        `the message must not mention ${forbidden}`,
      );
    }
  });
});

describe("the pipeline-failure notification", () => {
  const message = pipelineFailedEmail(
    "dana@practice.example",
    "audio unreadable — re-upload or write shorthand",
  );

  it("passes the product's own reason and nothing else", () => {
    assert.match(message.text, /audio unreadable/);
    assert.match(message.text, /deliberately contains no client information/);
    assert.ok(!message.subject.includes("audio"), "the subject line stays generic");
  });
});

describe("structurally unable to leak", () => {
  it("does not import the schema, the db, or any PHI-bearing module", () => {
    for (const forbidden of ["@/db", "@/db/schema", "@/lib/notes", "@/lib/sessions", "@/lib/clients"]) {
      assert.ok(
        !source.includes(`from "${forbidden}"`),
        `lib/email.ts must not import ${forbidden}`,
      );
    }
  });

  it("only ever sends the two templates defined here", () => {
    const senders = source.match(/export function \w+Email/g) ?? [];
    assert.deepEqual(senders.sort(), ["export function draftReadyEmail", "export function pipelineFailedEmail"]);
  });

  it("logs rather than sends when no provider is configured", () => {
    assert.match(source, /emailConfigured\(\)/);
    assert.match(source, /email:dry-run/);
  });
});
