import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONSENT_TEXT,
  acceptanceState,
  auditLines,
  explainLinkState,
  isLocked,
  isWellFormedToken,
  linkViewState,
  newPublicToken,
  paymentState,
  shortenUserAgent,
  signingState,
  tokensMatch,
  validateSignature,
  type LinkSubject,
} from "@/lib/esign";
import type { DocumentStatus, DocumentType } from "@/db/schema";

const at = (iso: string) => new Date(iso);
const NOW = at("2026-07-14T14:32:00Z");
const TOKEN = newPublicToken();

function subject(
  type: DocumentType,
  status: DocumentStatus,
  expiresAt: Date | null = null,
): LinkSubject {
  return { type, status, expiresAt };
}

describe("tokens", () => {
  it("mints 32 URL-safe characters", () => {
    const token = newPublicToken();
    assert.equal(token.length, 32);
    assert.match(token, /^[A-Za-z0-9_-]+$/);
  });

  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 500 }, () => newPublicToken()));
    assert.equal(seen.size, 500);
  });

  it("accepts only plausible tokens", () => {
    assert.equal(isWellFormedToken(TOKEN), true);
    assert.equal(isWellFormedToken("short"), false);
    assert.equal(isWellFormedToken(""), false);
    assert.equal(isWellFormedToken("a".repeat(65)), false);
    assert.equal(isWellFormedToken("../../etc/passwd"), false);
    assert.equal(isWellFormedToken("' or 1=1 --"), false);
    assert.equal(isWellFormedToken(undefined), false);
    assert.equal(isWellFormedToken(42), false);
  });

  it("compares without leaking length or content by timing", () => {
    assert.equal(tokensMatch(TOKEN, TOKEN), true);
    assert.equal(tokensMatch(TOKEN, `${TOKEN}x`), false);
    assert.equal(tokensMatch("", ""), true);
    assert.equal(tokensMatch(TOKEN, TOKEN.replace(/.$/, "!")), false);
  });
});

describe("linkViewState", () => {
  it("opens a sent document", () => {
    assert.equal(linkViewState(TOKEN, subject("proposal", "sent"), NOW), "ok");
  });

  it("refuses a malformed token before any lookup", () => {
    assert.equal(linkViewState("nope", subject("proposal", "sent"), NOW), "malformed");
  });

  it("refuses a token that matched nothing", () => {
    assert.equal(linkViewState(TOKEN, null, NOW), "not_found");
  });

  it("hides a draft", () => {
    assert.equal(linkViewState(TOKEN, subject("proposal", "draft"), NOW), "not_sent");
  });

  it("says so when a document was voided", () => {
    assert.equal(linkViewState(TOKEN, subject("contract", "void"), NOW), "voided");
  });

  it("closes an expired link", () => {
    const expired = subject("proposal", "sent", at("2026-07-01T00:00:00Z"));
    assert.equal(linkViewState(TOKEN, expired, NOW), "expired");
  });

  it("keeps an unexpired link open", () => {
    const live = subject("proposal", "sent", at("2026-08-01T00:00:00Z"));
    assert.equal(linkViewState(TOKEN, live, NOW), "ok");
  });

  it("still shows what the client already signed, expiry or not", () => {
    const signed = subject("contract", "signed", at("2026-07-01T00:00:00Z"));
    assert.equal(linkViewState(TOKEN, signed, NOW), "ok");
    const paid = subject("invoice", "paid", at("2020-01-01T00:00:00Z"));
    assert.equal(linkViewState(TOKEN, paid, NOW), "ok");
  });

  it("treats the expiry instant itself as still valid", () => {
    const edge = subject("proposal", "sent", NOW);
    assert.equal(linkViewState(TOKEN, edge, NOW), "ok");
    assert.equal(linkViewState(TOKEN, edge, new Date(NOW.getTime() + 1)), "expired");
  });
});

describe("signingState", () => {
  it("allows signing a sent or viewed contract", () => {
    assert.equal(signingState(TOKEN, subject("contract", "sent"), NOW), "ok");
    assert.equal(signingState(TOKEN, subject("contract", "viewed"), NOW), "ok");
  });

  it("refuses a second signature", () => {
    assert.equal(signingState(TOKEN, subject("contract", "signed"), NOW), "already_done");
  });

  it("refuses to sign a proposal or an invoice", () => {
    assert.equal(signingState(TOKEN, subject("proposal", "sent"), NOW), "wrong_type");
    assert.equal(signingState(TOKEN, subject("invoice", "sent"), NOW), "wrong_type");
  });

  it("refuses a draft, a voided, and an expired contract", () => {
    assert.equal(signingState(TOKEN, subject("contract", "draft"), NOW), "not_sent");
    assert.equal(signingState(TOKEN, subject("contract", "void"), NOW), "voided");
    assert.equal(
      signingState(TOKEN, subject("contract", "sent", at("2026-01-01T00:00:00Z")), NOW),
      "expired",
    );
  });

  it("refuses a malformed token", () => {
    assert.equal(signingState("x", subject("contract", "sent"), NOW), "malformed");
  });
});

describe("acceptanceState", () => {
  it("allows accepting a live proposal once", () => {
    assert.equal(acceptanceState(TOKEN, subject("proposal", "sent"), NOW), "ok");
    assert.equal(acceptanceState(TOKEN, subject("proposal", "viewed"), NOW), "ok");
    assert.equal(acceptanceState(TOKEN, subject("proposal", "accepted"), NOW), "already_done");
  });

  it("refuses a contract", () => {
    assert.equal(acceptanceState(TOKEN, subject("contract", "sent"), NOW), "wrong_type");
  });
});

describe("paymentState", () => {
  it("allows paying an invoice with a balance", () => {
    assert.equal(paymentState(TOKEN, subject("invoice", "sent"), NOW, 3_360_00), "ok");
    assert.equal(paymentState(TOKEN, subject("invoice", "overdue"), NOW, 3_360_00), "ok");
  });

  it("refuses when nothing is owed", () => {
    assert.equal(paymentState(TOKEN, subject("invoice", "paid"), NOW, 0), "already_done");
    assert.equal(paymentState(TOKEN, subject("invoice", "sent"), NOW, 0), "already_done");
  });

  it("refuses to take money against a proposal", () => {
    assert.equal(paymentState(TOKEN, subject("proposal", "sent"), NOW, 100), "wrong_type");
  });
});

describe("explainLinkState", () => {
  it("never reveals whether a document exists", () => {
    assert.equal(explainLinkState("not_found"), explainLinkState("malformed"));
  });

  it("has a sentence for every refusal", () => {
    for (const state of ["expired", "voided", "not_sent", "already_done", "wrong_type"] as const) {
      assert.ok(explainLinkState(state).length > 10, state);
    }
    assert.equal(explainLinkState("ok"), "");
  });
});

describe("validateSignature", () => {
  const good = {
    signerName: "Rosa Álvarez",
    signerEmail: "rosa@meridiancoffee.example",
    method: "typed" as const,
    signatureData: "Rosa Álvarez",
    consented: true,
  };

  it("accepts a typed signature with consent", () => {
    assert.deepEqual(validateSignature(good), { ok: true });
  });

  it("refuses without consent — this is the ESIGN requirement", () => {
    const result = validateSignature({ ...good, consented: false });
    assert.equal(result.ok, false);
    assert.match(result.error!, /consent/i);
  });

  it("refuses an initial as a name", () => {
    assert.equal(validateSignature({ ...good, signerName: "R" }).ok, false);
  });

  it("refuses a bad email", () => {
    assert.equal(validateSignature({ ...good, signerEmail: "rosa@meridian" }).ok, false);
  });

  it("refuses an empty typed signature", () => {
    assert.equal(validateSignature({ ...good, signatureData: " " }).ok, false);
  });

  it("accepts a drawn stroke with enough points", () => {
    const drawn = {
      ...good,
      method: "drawn" as const,
      signatureData: "M 12 84 L 40 60 L 66 92 L 96 48 L 130 70",
    };
    assert.deepEqual(validateSignature(drawn), { ok: true });
  });

  it("refuses an accidental tap", () => {
    const tap = { ...good, method: "drawn" as const, signatureData: "M 12 84 L 13 85" };
    assert.equal(validateSignature(tap).ok, false);
  });

  it("refuses a signature too large to store", () => {
    const huge = {
      ...good,
      method: "drawn" as const,
      signatureData: `M 0 0 ${"L 1 1 ".repeat(4000)}`,
    };
    assert.equal(validateSignature(huge).ok, false);
  });
});

describe("audit trail", () => {
  it("records who, when, where, how, and what was agreed", () => {
    const lines = auditLines({
      signerName: "Rosa Álvarez",
      signerEmail: "rosa@meridiancoffee.example",
      method: "drawn",
      ip: "189.14.2.20",
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1",
      signedAt: at("2026-07-14T14:32:09Z"),
      consentText: CONSENT_TEXT,
    });
    assert.equal(lines[0], "Signed by Rosa Álvarez (rosa@meridiancoffee.example)");
    assert.equal(lines[1], "Jul 14, 2026 · 14:32 UTC");
    assert.equal(lines[2], "Method: drawn signature");
    assert.equal(lines[3], "IP 189.14.2.20");
    assert.equal(lines[4], "Safari on iPhone");
    assert.match(lines[5], /electronic signature is the legal equivalent/);
  });

  it("omits IP and device when they were not captured", () => {
    const lines = auditLines({
      signerName: "Dan Okafor",
      signerEmail: "dan@example.com",
      method: "typed",
      ip: "",
      userAgent: "",
      signedAt: at("2026-07-14T09:05:00Z"),
      consentText: CONSENT_TEXT,
    });
    assert.equal(lines.length, 4);
    assert.ok(!lines.some((l) => l.startsWith("IP ")));
  });

  it("summarises user agents without a novel", () => {
    assert.equal(
      shortenUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      ),
      "Chrome on Windows NT 10.0",
    );
    assert.equal(shortenUserAgent("curl/8.6.0"), "browser on unknown device");
  });
});

describe("isLocked", () => {
  it("locks anything the client has acted on", () => {
    assert.equal(isLocked({ status: "signed" }), true);
    assert.equal(isLocked({ status: "accepted" }), true);
    assert.equal(isLocked({ status: "paid" }), true);
    assert.equal(isLocked({ status: "void" }), true);
  });

  it("leaves drafts and sent documents editable in the ways the app allows", () => {
    assert.equal(isLocked({ status: "draft" }), false);
    assert.equal(isLocked({ status: "sent" }), false);
  });
});
