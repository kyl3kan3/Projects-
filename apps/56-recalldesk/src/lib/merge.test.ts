import test from "node:test";
import assert from "node:assert/strict";
import { finalizeEmail, finalizeSms, lintCopy, renderTemplate, fieldsUsed } from "@/lib/merge";

test("merge fields are substituted", () => {
  const r = renderTemplate("Hi {{first_name}}, {{location_name}} here.", {
    first_name: "Rosalind",
    location_name: "Cedar Hollow — Maple St",
  });
  assert.equal(r.text, "Hi Rosalind, Cedar Hollow — Maple St here.");
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.unknown, []);
});

test("a missing value is reported, not silently blanked", () => {
  const r = renderTemplate("Hi {{first_name}}, it's been a while.", {});
  assert.deepEqual(r.missing, ["first_name"]);
  assert.ok(r.text.includes("{{first_name}}"));
});

test("an empty-string value counts as missing", () => {
  const r = renderTemplate("Hi {{first_name}}.", { first_name: "   " });
  assert.deepEqual(r.missing, ["first_name"]);
});

test("an unknown field name is reported", () => {
  const r = renderTemplate("Hi {{nickname}}.", { first_name: "Rosalind" });
  assert.deepEqual(r.unknown, ["nickname"]);
});

test("whitespace inside the braces is tolerated", () => {
  const r = renderTemplate("Hi {{ first_name }}.", { first_name: "Amara" });
  assert.equal(r.text, "Hi Amara.");
});

test("fieldsUsed lists what a template references", () => {
  assert.deepEqual(fieldsUsed("Hi {{first_name}} — {{booking_link}} {{first_name}}"), [
    "first_name",
    "booking_link",
  ]);
});

test("STOP language is appended to SMS when absent, not duplicated when present", () => {
  const a = finalizeSms("Hi Rosalind, we saved you a hygiene slot.");
  assert.ok(a.body.endsWith("Reply STOP to opt out."));
  const b = finalizeSms("Hi Rosalind. Reply STOP to opt out.");
  assert.equal(b.body, "Hi Rosalind. Reply STOP to opt out.");
});

test("SMS segments are counted and over-long bodies flagged", () => {
  const short = finalizeSms("Short one.");
  assert.equal(short.segments, 1);
  assert.equal(short.tooLong, false);
  const long = finalizeSms("x".repeat(400));
  assert.equal(long.tooLong, true);
  assert.ok(long.segments >= 3);
});

test("an unsubscribe link is appended to email when the template omits it", () => {
  const url = "https://recalldesk.app/stop/abc";
  assert.ok(finalizeEmail("Body text.", url).includes(url));
  const already = finalizeEmail(`Body. Unsubscribe: ${url}`, url);
  assert.equal(already.split(url).length - 1, 1);
});

test("lint flags shorteners, shouting, free!, and a missing booking link", () => {
  const codes = lintCopy({
    subject: "COME BACK",
    body: "Free cleaning! http://bit.ly/x",
    channel: "email",
  }).map((w) => w.code);
  assert.ok(codes.includes("shortener"));
  assert.ok(codes.includes("all_caps"));
  assert.ok(codes.includes("free_bang"));
  assert.ok(codes.includes("no_link"));
});

test("lint flags clinical words in an email subject as a PHI leak", () => {
  const codes = lintCopy({
    subject: "Your periodontal maintenance is overdue",
    body: "Book here: {{booking_link}}",
    channel: "email",
  }).map((w) => w.code);
  assert.ok(codes.includes("phi_subject"));
});

test("a clean template lints clean", () => {
  assert.deepEqual(
    lintCopy({
      subject: "Time for your next visit",
      body: "Hi {{first_name}}, it's been since {{last_visit}}. Pick a time: {{booking_link}}",
      channel: "email",
    }),
    [],
  );
});

test("STOP is not treated as shouting", () => {
  const codes = lintCopy({
    subject: null,
    body: "Hi {{first_name}}, pick a time: {{booking_link}} Reply STOP to opt out.",
    channel: "sms",
  }).map((w) => w.code);
  assert.deepEqual(codes, []);
});
