/**
 * The model path, driven by a fake client.
 *
 * There is no ANTHROPIC_API_KEY in this environment, so the live call is
 * deliberately not exercised anywhere. Everything around it is: the prompt, the
 * forced tool, where the tool call is found, schema validation, the repair pass,
 * cost accounting, timeouts, and — the part that decides whether this product can
 * be trusted — what happens when the model returns nonsense, prose, or a refusal.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CertificateSchema,
  RECORD_CERTIFICATE_TOOL,
  SYSTEM_PROMPT,
  extractLocally,
  extractWithModel,
  statusFor,
  type ModelClient,
  type ModelRequest,
  type ModelResponse,
} from "./parse";
import { buildSampleAcordPdf, compliantSample } from "./acord-sample";

const PDF = Buffer.from("%PDF-1.7\nnot really a pdf\n%%EOF");

const GOOD_PAYLOAD = {
  carrier: "Grayline Mutual Casualty Company",
  producer: "Harbor & Main Insurance Agency",
  holder: "Harbor Ridge Management LLC",
  confidence: { carrier: 97, producer: 95, holder: 99 },
  lines: [
    {
      kind: "gl_each_occurrence",
      label: "General liability — each occurrence",
      limitCents: 100_000_000,
      policyNumber: "GL-4471-22",
      effectiveOn: "2026-01-01",
      expiresOn: "2027-01-01",
      additionalInsured: true,
      waiverOfSubrogation: true,
      confidence: {
        limitCents: 98,
        policyNumber: 96,
        effectiveOn: 97,
        expiresOn: 97,
        additionalInsured: 93,
        waiverOfSubrogation: 93,
      },
    },
  ],
};

function toolReply(input: unknown, usage = { inputTokens: 4200, outputTokens: 380 }): ModelResponse {
  return {
    content: [{ type: "tool_use", name: RECORD_CERTIFICATE_TOOL.name, input }],
    stopReason: "tool_use",
    usage,
  };
}

/** A client that answers with a scripted sequence and records what it was asked. */
function fakeClient(replies: Array<ModelResponse | Error>): ModelClient & { calls: ModelRequest[] } {
  const calls: ModelRequest[] = [];
  let i = 0;
  return {
    calls,
    async create(req) {
      calls.push(req);
      const reply = replies[Math.min(i++, replies.length - 1)];
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
}

/* ----------------------------------------------------------- prompt assembly */

test("the request forces the record_certificate tool and ships the PDF as a document", async () => {
  const client = fakeClient([toolReply(GOOD_PAYLOAD)]);
  const out = await extractWithModel(client, PDF, { filename: "kestrel-coi.pdf" });
  assert.equal(out.ok, true);

  const req = client.calls[0];
  assert.equal(req.toolChoice.type, "tool");
  assert.equal(req.toolChoice.name, "record_certificate");
  assert.deepEqual(req.tools, [RECORD_CERTIFICATE_TOOL]);
  assert.equal(req.system, SYSTEM_PROMPT);

  const content = req.messages[0].content as Array<Record<string, unknown>>;
  const doc = content[0] as { type: string; source: { media_type: string; data: string } };
  assert.equal(doc.type, "document");
  assert.equal(doc.source.media_type, "application/pdf");
  assert.equal(doc.source.data, PDF.toString("base64"));
  assert.match(String((content[1] as { text: string }).text), /kestrel-coi\.pdf/);
});

test("the system prompt forbids estimating and pins the units", () => {
  assert.match(SYSTEM_PROMPT, /Never estimate/);
  assert.match(SYSTEM_PROMPT, /blank ADDL INSD or SUBR WVD column is null, not false/);
  assert.match(SYSTEM_PROMPT, /integer cents/);
});

/* --------------------------------------------------------------- happy path */

test("a valid tool call becomes an extracted certificate with per-field confidence", async () => {
  const client = fakeClient([toolReply(GOOD_PAYLOAD)]);
  const out = await extractWithModel(client, PDF);
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.via, "model");
  assert.equal(out.repaired, false);
  assert.equal(out.certificate.holder, "Harbor Ridge Management LLC");
  assert.equal(out.certificate.lines[0].limitCents, 100_000_000);
  assert.equal(out.certificate.lines[0].fieldConfidence.expiresOn, 97);
  assert.equal(out.certificate.fieldConfidence.carrier, 97);
  assert.equal(client.calls.length, 1);
});

test("token usage is priced once, in whole cents", async () => {
  const client = fakeClient([toolReply(GOOD_PAYLOAD, { inputTokens: 5_000, outputTokens: 1_000 })]);
  const out = await extractWithModel(client, PDF);
  assert.equal(out.ok, true);
  // 5k in at $3/MTok = 1.5c, 1k out at $15/MTok = 1.5c → 3c
  assert.deepEqual(out.usage, { inputTokens: 5_000, outputTokens: 1_000, costCents: 3 });
});

/* ---------------------------------------------------------- the repair pass */

test("prose instead of a tool call gets one repair pass, then succeeds", async () => {
  const client = fakeClient([
    {
      content: [{ type: "text", text: "This appears to be an invoice, not a certificate." }],
      stopReason: "end_turn",
      usage: { inputTokens: 3000, outputTokens: 40 },
    },
    toolReply(GOOD_PAYLOAD),
  ]);
  const out = await extractWithModel(client, PDF);
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.repaired, true);
  assert.equal(client.calls.length, 2);
  // The repair turn shows the model its own reply and asks again.
  const second = client.calls[1].messages;
  assert.equal(second.length, 3);
  assert.match(String(second[2].content), /You did not call record_certificate/);
  // Both attempts are billed.
  assert.equal(out.usage!.inputTokens, 7200);
});

test("a schema-invalid tool call is repaired by naming the field that failed", async () => {
  const bad = {
    ...GOOD_PAYLOAD,
    lines: [{ ...GOOD_PAYLOAD.lines[0], expiresOn: "01/01/2027" }],
  };
  const client = fakeClient([toolReply(bad), toolReply(GOOD_PAYLOAD)]);
  const out = await extractWithModel(client, PDF);
  assert.equal(out.ok, true);
  assert.match(String(client.calls[1].messages[2].content), /expiresOn: expected YYYY-MM-DD/);
});

test("two bad replies is a failure, not a third attempt", async () => {
  const bad = { carrier: "Grayline", lines: "not an array" };
  const client = fakeClient([toolReply(bad), toolReply(bad), toolReply(GOOD_PAYLOAD)]);
  const out = await extractWithModel(client, PDF);
  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.equal(client.calls.length, 2, "no third attempt");
  assert.match(out.error, /did not match the certificate schema/);
  assert.ok(out.usage, "the failed attempts are still billed and reported");
});

/* ------------------------------------------------------ nonsense and refusal */

test("a confident-looking but invalid limit is rejected outright, not coerced", async () => {
  const nonsense = {
    ...GOOD_PAYLOAD,
    lines: [{ ...GOOD_PAYLOAD.lines[0], limitCents: "one million dollars" }],
  };
  const client = fakeClient([toolReply(nonsense)]);
  const out = await extractWithModel(client, PDF);
  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.match(out.error, /limitCents/);
});

test("a confidence outside 0-100 is rejected — the review gate depends on it", () => {
  const parsed = CertificateSchema.safeParse({
    ...GOOD_PAYLOAD,
    confidence: { carrier: 140, producer: 95, holder: 99 },
  });
  assert.equal(parsed.success, false);
});

test("an answer cut off by max_tokens fails with a sentence a coordinator can act on", async () => {
  const client = fakeClient([
    { content: [{ type: "text", text: "COMMERCIAL GENERAL LIA" }], stopReason: "max_tokens" },
    { content: [{ type: "text", text: "COMMERCIAL GENERAL LIA" }], stopReason: "max_tokens" },
  ]);
  const out = await extractWithModel(client, PDF);
  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.match(out.error, /cut off before the model finished/);
  assert.match(out.error, /Nothing was recorded/);
});

test("a refusal is reported verbatim rather than becoming an empty certificate", async () => {
  const refusal = "I can't help with extracting data from insurance documents.";
  const client = fakeClient([
    { content: [{ type: "text", text: refusal }], stopReason: "end_turn" },
    { content: [{ type: "text", text: refusal }], stopReason: "end_turn" },
  ]);
  const out = await extractWithModel(client, PDF);
  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.ok(out.error.includes(refusal));
});

test("a transport error fails cleanly and says the document is still stored", async () => {
  const client = fakeClient([new Error("503 Service Unavailable")]);
  const out = await extractWithModel(client, PDF);
  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.match(out.error, /could not be reached: 503 Service Unavailable/);
});

test("a hung call times out and says so in plain language", async () => {
  const client: ModelClient = { create: () => new Promise(() => {}) };
  const out = await extractWithModel(client, PDF, { timeoutMs: 20 });
  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.match(out.error, /did not answer within 90 seconds/);
  assert.match(out.error, /entered by hand/);
});

test("an empty-lines tool call is accepted and then fails the review gate", async () => {
  const empty = {
    carrier: null,
    producer: null,
    holder: null,
    confidence: { carrier: 0, producer: 0, holder: 0 },
    lines: [],
  };
  const client = fakeClient([toolReply(empty)]);
  const out = await extractWithModel(client, PDF);
  assert.equal(out.ok, true);
  if (!out.ok) return;
  // Structurally valid, so it is recorded — and every field is at zero, so it
  // cannot reach compliance without a human.
  assert.equal(statusFor(out.certificate, 80), "needs_review");
});

/* ------------------------------------------------------------- local path */

test("the local path reads a real sample PDF end to end", async () => {
  const bytes = await buildSampleAcordPdf(compliantSample());
  const out = extractLocally(bytes);
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.via, "local");
  assert.equal(out.certificate.lines.length, 5);
  assert.equal(statusFor(out.certificate, 80), "parsed");
});

test("a PDF with no text layer fails with the scan explanation", () => {
  const out = extractLocally(Buffer.from("%PDF-1.7\n%%EOF"));
  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.match(out.error, /most likely a scan/);
  assert.match(out.error, /document is stored/);
});

test("a text PDF that is not a certificate fails rather than recording nothing", async () => {
  // A one-page letter, built the same way a certificate is.
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Dear Ms Alvarez, please find our invoice for March attached.", {
    x: 40,
    y: 700,
    size: 12,
    font,
  });
  const out = extractLocally(await doc.save({ useObjectStreams: false }));
  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.match(out.error, /no ACORD coverage table/);
});
