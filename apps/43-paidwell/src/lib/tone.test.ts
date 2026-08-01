import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MERGE_FIELDS,
  renderStep,
  renderTemplate,
  stepCopy,
  validateTemplate,
  type MergeContext,
} from "@/lib/tone";
import type { EscalationLevel, TonePreset } from "@/db/schema";

const CTX: MergeContext = {
  contactFirstName: "Dana",
  clientName: "Meridian Co",
  firmName: "Northbank Studio",
  invoiceNumber: "INV-2041",
  amount: "$12,400.00",
  dueDate: "10 Jul 2026",
  daysOverdue: 21,
  daysUntilDue: 0,
  portalUrl: "https://paidwell.app/portal/abc123",
  signature: "Ana Reyes\nNorthbank Studio",
  promiseDate: "12 Jul 2026",
};

const TONES: TonePreset[] = ["warm", "neutral", "firm"];
const LEVELS: EscalationLevel[] = [1, 2, 3, 4];

describe("renderTemplate", () => {
  it("substitutes every documented merge field", () => {
    const template = MERGE_FIELDS.map((f) => `{{${f.token}}}`).join(" | ");
    const out = renderTemplate(template, CTX);
    assert.doesNotMatch(out, /\{\{/);
    assert.match(out, /Dana/);
    assert.match(out, /\$12,400\.00/);
    assert.match(out, /https:\/\/paidwell\.app\/portal\/abc123/);
  });

  it("tolerates whitespace inside the braces", () => {
    assert.equal(renderTemplate("Hi {{ contact_first_name }},", CTX), "Hi Dana,");
  });

  it("leaves an unknown token visible rather than blanking it", () => {
    // A silent blank is how "Hi ," reaches a client. Better to look broken in
    // the preview than to look careless in their inbox.
    assert.equal(renderTemplate("Hi {{nickname}}", CTX), "Hi {{nickname}}");
  });
});

describe("validateTemplate", () => {
  it("accepts a sound template", () => {
    assert.deepEqual(
      validateTemplate("{{invoice_number}} is due", "Hi {{contact_first_name}}, pay: {{portal_link}}"),
      [],
    );
  });

  it("catches an unknown merge field", () => {
    const problems = validateTemplate("Hi {{oops}}", "Body {{portal_link}}");
    assert.ok(problems.some((p) => /Unknown merge field/.test(p.message)));
  });

  it("catches single braces, the usual typo", () => {
    const problems = validateTemplate("Hi {contact_first_name}", "Body {{portal_link}}");
    assert.ok(problems.some((p) => /double braces/.test(p.message)));
  });

  it("insists on a payment link so the client is never forced to reply", () => {
    const problems = validateTemplate("Subject", "No link here");
    assert.ok(problems.some((p) => /portal_link/.test(p.message)));
  });

  it("rejects an empty subject and an over-long one", () => {
    assert.ok(validateTemplate("", "x {{portal_link}}").some((p) => p.field === "subject"));
    assert.ok(
      validateTemplate("x".repeat(200), "x {{portal_link}}").some((p) => /under 120/.test(p.message)),
    );
  });
});

describe("the copy itself", () => {
  it("has copy for every tone at every level", () => {
    for (const tone of TONES) {
      for (const level of LEVELS) {
        const copy = stepCopy(tone, level);
        assert.ok(copy.subject.length > 0, `${tone}/${level} subject`);
        assert.ok(copy.body.length >= 3, `${tone}/${level} body`);
        assert.ok(copy.body.join(" ").includes("{{portal_link}}"), `${tone}/${level} link`);
        assert.ok(copy.body.join(" ").includes("{{signature}}"), `${tone}/${level} signature`);
      }
    }
  });

  it("escalates in wording, never in threat", () => {
    for (const tone of TONES) {
      for (const level of LEVELS) {
        const rendered = renderStep({ tone, level, ctx: CTX });
        assert.doesNotMatch(
          rendered.text,
          /immediately|legal action|debt collect|collections agency|litigation|attorney|credit rating/i,
          `${tone}/${level} must not threaten`,
        );
        assert.doesNotMatch(rendered.text, /!/, `${tone}/${level} must not shout`);
        // No emoji anywhere, in the product or in what it sends.
        assert.doesNotMatch(rendered.text, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
        assert.doesNotMatch(rendered.text, /Dear valued customer/i);
      }
    }
  });

  it("says a human takes over after the final rung", () => {
    for (const tone of TONES) {
      const final = renderStep({ tone, level: 4, ctx: CTX });
      assert.match(final.text, /(from me|myself|directly)/i);
    }
  });

  it("always offers a date as an alternative to money", () => {
    for (const tone of TONES) {
      for (const level of [2, 3, 4] as EscalationLevel[]) {
        assert.match(renderStep({ tone, level, ctx: CTX }).text, /date/i, `${tone}/${level}`);
      }
    }
  });

  it("names the agreed date on a promise-aware send", () => {
    for (const tone of TONES) {
      const rendered = renderStep({ tone, level: 3, promiseAware: true, ctx: CTX });
      assert.match(rendered.text, /12 Jul 2026/);
      assert.match(rendered.subject, /12 Jul 2026|INV-2041/);
    }
  });
});

describe("renderStep", () => {
  it("fills the merge fields in subject and body", () => {
    const rendered = renderStep({ tone: "warm", level: 3, ctx: CTX });
    assert.match(rendered.subject, /INV-2041/);
    assert.match(rendered.subject, /21 days overdue/);
    assert.match(rendered.text, /Hi Dana,/);
    assert.doesNotMatch(rendered.text, /\{\{/);
    assert.doesNotMatch(rendered.subject, /\{\{/);
  });

  it("honours a per-step override", () => {
    const rendered = renderStep({
      tone: "warm",
      level: 2,
      overrideSubject: "Quick one about {{invoice_number}}",
      overrideBody: "Hi {{contact_first_name}},\n\nPay here: {{portal_link}}\n\n{{signature}}",
      ctx: CTX,
    });
    assert.equal(rendered.subject, "Quick one about INV-2041");
    assert.match(rendered.text, /Pay here: https:\/\/paidwell\.app/);
    assert.doesNotMatch(rendered.text, /approvals queue/);
  });

  it("keeps the late-fee sentence off early nudges even when it is switched on", () => {
    const sentence = "Our terms allow a 1.5% monthly late charge on balances past 30 days.";
    const gentle = renderStep({ tone: "neutral", level: 2, lateFeeSentence: sentence, ctx: CTX });
    const firm = renderStep({ tone: "neutral", level: 3, lateFeeSentence: sentence, ctx: CTX });
    assert.doesNotMatch(gentle.text, /late charge/);
    assert.match(firm.text, /late charge/);
    // And it lands before the signature, not after it.
    assert.ok(firm.text.indexOf("late charge") < firm.text.indexOf("Ana Reyes"));
  });

  it("omits the late-fee sentence entirely by default", () => {
    const rendered = renderStep({ tone: "neutral", level: 4, ctx: CTX });
    assert.doesNotMatch(rendered.text, /late (fee|charge)/i);
  });

  it("produces HTML that carries the firm's name, not ours, at the top", () => {
    const rendered = renderStep({ tone: "warm", level: 2, ctx: CTX });
    const firmIndex = rendered.html.indexOf("Northbank Studio");
    const paidwellIndex = rendered.html.indexOf("PaidWell");
    assert.ok(firmIndex > -1);
    assert.ok(paidwellIndex > firmIndex, "PaidWell must appear only in the footer");
    assert.match(rendered.html, /INV-2041/);
    assert.match(rendered.html, /View or pay this invoice/);
    // Nothing that reads as marketing: no images, no gradient.
    assert.doesNotMatch(rendered.html, /<img|linear-gradient/);
  });

  it("escapes a client name that contains markup", () => {
    const rendered = renderStep({
      tone: "warm",
      level: 2,
      ctx: { ...CTX, firmName: 'Ampersand & Co <script>alert(1)</script>' },
    });
    assert.doesNotMatch(rendered.html, /<script>/);
    assert.match(rendered.html, /Ampersand &amp; Co/);
  });

  it("stays far under Gmail's clipping threshold", () => {
    const rendered = renderStep({ tone: "warm", level: 4, ctx: CTX });
    assert.ok(Buffer.byteLength(rendered.html) < 20_000);
  });
});
