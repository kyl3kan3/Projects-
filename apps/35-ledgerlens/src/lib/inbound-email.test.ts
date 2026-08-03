import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  extractArtifacts,
  htmlToText,
  looksFinancial,
  recipientAddresses,
  resolveOrgSlug,
  verifyInboundSignature,
} from "./inbound-email";
import { extractAddress, slugFromAddress } from "./org";

process.env.INBOUND_EMAIL_DOMAIN = "in.ledgerlens.app";
process.env.RESEND_WEBHOOK_SECRET = "whsec_dGVzdHNlY3JldA==";

test("the plus-address slug is parsed, and nothing else is accepted", () => {
  assert.equal(slugFromAddress("docs+acme-4f21@in.ledgerlens.app"), "acme-4f21");
  assert.equal(slugFromAddress('"Books" <DOCS+Acme-4F21@in.ledgerlens.app>'), "acme-4f21");
  assert.equal(slugFromAddress("docs@in.ledgerlens.app"), null, "no slug at all");
  assert.equal(slugFromAddress("docs+acme@example.com"), null, "wrong domain");
  assert.equal(slugFromAddress("hello+acme@in.ledgerlens.app"), null, "wrong mailbox");
  assert.equal(slugFromAddress("not an address"), null);
});

test("extractAddress handles the display-name form providers deliver", () => {
  assert.equal(extractAddress("Ana Vasquez <ana@vasquezplumbing.com>"), "ana@vasquezplumbing.com");
  assert.equal(extractAddress("  ANA@VASQUEZPLUMBING.COM "), "ana@vasquezplumbing.com");
  assert.equal(extractAddress("nonsense"), null);
});

test("the recipient list is scanned so a forward that CCs us still lands", () => {
  const payload = {
    to: ["bookkeeper@example.com, docs+acme-4f21@in.ledgerlens.app"],
  };
  assert.deepEqual(recipientAddresses(payload), [
    "bookkeeper@example.com",
    "docs+acme-4f21@in.ledgerlens.app",
  ]);
  assert.equal(resolveOrgSlug(payload), "acme-4f21");
  assert.equal(resolveOrgSlug({ to: "someone@example.com" }), null);
});

/* --------------------------------------------------------------- signature --- */

function signed(body: string, secret = "whsec_dGVzdHNlY3JldA=="): Headers {
  const id = "msg_2f9";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const mac = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  return new Headers({
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${mac}`,
  });
}

test("a correctly signed payload verifies", () => {
  const body = JSON.stringify({ subject: "Invoice" });
  assert.deepEqual(verifyInboundSignature(signed(body), body), { ok: true });
});

test("a tampered body, a wrong key, and a missing header all fail", () => {
  const body = JSON.stringify({ subject: "Invoice" });
  const headers = signed(body);
  assert.equal(verifyInboundSignature(headers, `${body} `).ok, false);
  assert.equal(verifyInboundSignature(signed(body, "whsec_b3RoZXI="), body).ok, false);
  assert.equal(verifyInboundSignature(new Headers(), body).ok, false);
});

test("a replayed old timestamp is refused", () => {
  const body = "{}";
  const stale = new Headers({
    "svix-id": "msg_old",
    "svix-timestamp": String(Math.floor(Date.now() / 1000) - 3_600),
    "svix-signature": "v1,whatever",
  });
  assert.deepEqual(verifyInboundSignature(stale, body), { ok: false, reason: "stale_timestamp" });
});

/** An unset secret must refuse, never wave the request through. */
test("an unset webhook secret refuses rather than allowing", () => {
  const previous = process.env.RESEND_WEBHOOK_SECRET;
  delete process.env.RESEND_WEBHOOK_SECRET;
  try {
    assert.deepEqual(verifyInboundSignature(new Headers(), "{}"), {
      ok: false,
      reason: "webhook_secret_unset",
    });
  } finally {
    process.env.RESEND_WEBHOOK_SECRET = previous;
  }
});

/* --------------------------------------------------------------- artifacts --- */

const b64 = (s: string) => Buffer.from(s).toString("base64");

test("attachments are taken, and unsupported types are skipped with a reason", () => {
  const { artifacts, skipped } = extractArtifacts({
    subject: "Invoice 4471",
    text: "See attached. Total $148.32",
    attachments: [
      { filename: "invoice.pdf", contentType: "application/pdf", content: b64("%PDF-1.7") },
      { filename: "sig.p7s", contentType: "application/pkcs7-signature", content: b64("junk") },
      { filename: "photo.JPG", contentType: "application/octet-stream", content: b64("\xff\xd8\xff") },
    ],
  });
  assert.deepEqual(
    artifacts.map((a) => a.mimeType),
    ["application/pdf", "image/jpeg"],
    "the extension rescues an octet-stream attachment",
  );
  assert.equal(skipped.length, 1);
  assert.match(skipped[0].reason, /unsupported_type/);
  // The covering email's text rides along with the attachment.
  assert.match(artifacts[0].text ?? "", /148\.32/);
});

test("an email with no attachment but a total in the body becomes a document", () => {
  const { artifacts } = extractArtifacts({
    subject: "Fwd: Your Jobber receipt",
    from: "billing@getjobber.com",
    html: "<div>Receipt from Jobber</div><p>Total <b>$129.00</b></p>",
  });
  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0].mimeType, "text/plain");
  assert.equal(artifacts[0].filename, "your-jobber-receipt.txt");
  assert.match(artifacts[0].text ?? "", /Total \$129\.00/);
});

test("a newsletter with no money in it produces nothing to extract", () => {
  const { artifacts } = extractArtifacts({
    subject: "This week in plumbing",
    html: "<p>Ten tips for winterising a hose bib.</p>",
  });
  assert.deepEqual(artifacts, []);
});

test("looksFinancial needs both an amount and a financial word", () => {
  assert.equal(looksFinancial("Total $12.00"), true);
  assert.equal(looksFinancial("Amount due 148.32"), true);
  assert.equal(looksFinancial("Meet me at 12.30 for coffee"), false, "no keyword");
  assert.equal(looksFinancial("Your invoice is attached"), false, "no amount");
  assert.equal(looksFinancial(""), false);
});

test("an over-long attachment list is truncated and the rest reported", () => {
  const many = Array.from({ length: MAX_ATTACHMENTS_PER_MESSAGE + 3 }, (_, i) => ({
    filename: `page-${i}.png`,
    contentType: "image/png",
    content: b64(`png-${i}`),
  }));
  const { artifacts, skipped } = extractArtifacts({ attachments: many, text: "Total $1.00" });
  assert.equal(artifacts.length, MAX_ATTACHMENTS_PER_MESSAGE);
  assert.equal(skipped.length, 3);
  assert.equal(skipped[0].reason, "too_many_attachments");
});

test("an empty attachment is skipped rather than stored as a zero-byte document", () => {
  const { artifacts, skipped } = extractArtifacts({
    attachments: [{ filename: "empty.png", contentType: "image/png", content: "" }],
  });
  assert.deepEqual(artifacts, []);
  assert.deepEqual(skipped, [{ filename: "empty.png", reason: "empty" }]);
});

test("htmlToText keeps the line structure a receipt parser depends on", () => {
  const text = htmlToText(
    "<style>p{color:red}</style><div>HOME DEPOT</div><p>Subtotal 72.68</p><p>Total&nbsp;79.08</p><script>x()</script>",
  );
  assert.equal(text, "HOME DEPOT\nSubtotal 72.68\nTotal 79.08");
  assert.doesNotMatch(text, /color:red|x\(\)/);
});
