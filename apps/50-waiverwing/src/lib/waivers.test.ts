/**
 * The tests that protect the product's whole value proposition: that a signature
 * still means, eighteen months later, exactly what it meant when it was given.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import {
  expiresAt,
  expiryRuleLabel,
  hashText,
  renderVersionText,
  shortHash,
  validateBlocks,
  versionTextHash,
  type RenderableVersion,
} from "@/lib/waivers";
import { DEFAULT_MINOR_RULE, type WaiverBlock } from "@/db/schema";
import { TEMPLATES } from "@/lib/templates";

const blocks: WaiverBlock[] = [
  {
    key: "risks",
    kind: "liability_text",
    config: {
      heading: "Acknowledgement of risk",
      body: "Bouldering means climbing without a rope above padded flooring. A ground fall is possible on every attempt.",
    },
  },
  {
    key: "clause_belay",
    kind: "initialed_clause",
    config: { text: "I will be checked by staff before I belay.", prompt: "Initial here" },
  },
  {
    key: "emergency_name",
    kind: "question",
    config: { label: "Emergency contact name", kind: "text", required: true },
  },
  {
    key: "signature",
    kind: "signature",
    config: { disclosure: "I have read this waiver and sign it voluntarily.", allowDrawn: true },
  },
];

function version(overrides: Partial<RenderableVersion> = {}): RenderableVersion {
  return {
    title: "Granite Works climbing waiver",
    version: 1,
    bodyBlocks: blocks,
    expiryRule: "days_365",
    minorRule: DEFAULT_MINOR_RULE,
    ...overrides,
  };
}

describe("validateBlocks", () => {
  it("accepts a complete waiver", () => {
    assert.deepEqual(validateBlocks(blocks), []);
  });

  it("insists on liability text and exactly one signature block", () => {
    assert.match(validateBlocks(blocks.slice(1)).join(" "), /liability text block/);
    assert.match(validateBlocks(blocks.slice(0, 3)).join(" "), /signature block/);
    assert.match(
      validateBlocks([...blocks, { key: "sig2", kind: "signature", config: {} }]).join(" "),
      /exactly one signature block/,
    );
  });

  it("rejects a liability block that is too short to be a real clause", () => {
    const thin: WaiverBlock[] = [
      { key: "risks", kind: "liability_text", config: { heading: "Risk", body: "Be careful." } },
      blocks[3],
    ];
    assert.match(validateBlocks(thin).join(" "), /too short/);
  });

  it("rejects duplicate block keys — a hash needs stable keys", () => {
    const dupes = [...blocks, { ...blocks[1] }];
    assert.match(validateBlocks(dupes).join(" "), /Duplicate block keys/);
  });

  it("accepts every shipped template", () => {
    for (const t of TEMPLATES) {
      assert.deepEqual(validateBlocks(t.blocks), [], `${t.key} should be publishable`);
    }
  });
});

describe("renderVersionText", () => {
  it("is stable across calls", () => {
    assert.equal(renderVersionText(version()), renderVersionText(version()));
  });

  it("includes the title, version, term, minor rule, clauses, questions and disclosure", () => {
    const text = renderVersionText(version());
    assert.match(text, /^WAIVER: Granite Works climbing waiver$/m);
    assert.match(text, /^VERSION: 1$/m);
    assert.match(text, /valid for 365 days/);
    assert.match(text, /under 18 must be signed for/);
    assert.match(text, /CLAUSE \[clause_belay\] \(initials required\)/);
    assert.match(text, /QUESTION \[emergency_name\] \(required\)/);
    assert.match(text, /DISCLOSURE: I have read this waiver/);
  });

  it("changes when any signed-meaning input changes", () => {
    const base = versionTextHash(version());
    assert.notEqual(base, versionTextHash(version({ version: 2 })));
    assert.notEqual(base, versionTextHash(version({ title: "Granite Works waiver" })));
    assert.notEqual(base, versionTextHash(version({ expiryRule: "forever" })));
    assert.notEqual(
      base,
      versionTextHash(version({ minorRule: { ...DEFAULT_MINOR_RULE, ageOfMajority: 19 } })),
    );

    const edited = blocks.map((b) =>
      b.key === "risks"
        ? {
            ...b,
            config: { ...b.config, body: "Bouldering is a bit risky." },
          }
        : b,
    );
    assert.notEqual(base, versionTextHash(version({ bodyBlocks: edited })));
  });

  it("ignores cosmetic whitespace, so a re-save is not a new agreement", () => {
    const respaced = blocks.map((b) =>
      b.key === "risks"
        ? {
            ...b,
            config: {
              heading: "Acknowledgement of risk",
              body: "Bouldering means climbing without a rope above padded flooring.   A ground fall is possible on every attempt.  ",
            },
          }
        : b,
    );
    assert.equal(versionTextHash(version()), versionTextHash(version({ bodyBlocks: respaced })));
  });

  it("hashes with plain SHA-256 over the rendering — verifiable by anyone", () => {
    // An independent hash of the rendered text, exactly as the ROADMAP asks.
    const independent = createHash("sha256")
      .update(renderVersionText(version()), "utf8")
      .digest("hex");
    assert.equal(versionTextHash(version()), independent);
    assert.equal(hashText("waiverwing").length, 64);
  });

  it("renders the mono short form for the evidence line", () => {
    assert.equal(shortHash("4b1e0000000000000000000000009c77"), "4B1E…9C77");
  });
});

describe("expiresAt", () => {
  const signedAt = new Date("2026-03-02T16:41:00Z"); // 09:41 in Denver

  it("expires a single-visit waiver at the end of the venue's day, not 24h later", () => {
    const end = expiresAt("visit", signedAt, "America/Denver");
    assert.ok(end);
    // Denver is UTC-7 on 2 March 2026, so midnight local is 07:00Z on the 3rd.
    assert.equal(end.toISOString(), "2026-03-03T07:00:00.000Z");
  });

  it("puts a Denver late-night signing on the same Denver day", () => {
    // 23:40 Denver on 2 March = 06:40Z on 3 March.
    const end = expiresAt("visit", new Date("2026-03-03T06:40:00Z"), "America/Denver");
    assert.equal(end?.toISOString(), "2026-03-03T07:00:00.000Z");
  });

  it("handles the spring-forward day without losing an hour of coverage", () => {
    // US DST starts 8 March 2026. A waiver signed on the 7th must still cover
    // the whole of the 7th.
    const end = expiresAt("visit", new Date("2026-03-07T18:00:00Z"), "America/Denver");
    assert.equal(end?.toISOString(), "2026-03-08T07:00:00.000Z");
  });

  it("gives a 365-day waiver exactly 365 days", () => {
    const end = expiresAt("days_365", signedAt, "America/Denver");
    assert.equal(end?.toISOString(), "2027-03-02T16:41:00.000Z");
  });

  it("never expires a 'forever' waiver", () => {
    assert.equal(expiresAt("forever", signedAt, "America/Denver"), null);
  });

  it("labels each rule in plain language for the rendered text", () => {
    assert.match(expiryRuleLabel("visit"), /today's visit only/);
    assert.match(expiryRuleLabel("days_365"), /365 days/);
    assert.match(expiryRuleLabel("forever"), /until revoked/);
  });
});
