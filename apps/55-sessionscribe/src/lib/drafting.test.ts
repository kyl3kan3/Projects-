/**
 * Everything around the model call — which, per the brief, is where the bugs live.
 * The live Anthropic path is unexercised here (there is no API key in this
 * environment), so these cover prompt assembly, schema validation, citation
 * checking, the fixture drafter, and cost accounting.
 *
 * The load-bearing case is the third one: a model that cites a span which does not
 * exist must lose the citation and have its sentence flagged, not keep a
 * fabricated provenance.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSectionPrompt,
  costMicrosFor,
  DraftValidationError,
  fixtureDraft,
  renderTranscript,
  validateSection,
  type DraftInput,
} from "@/lib/drafting";
import { fixtureTranscript } from "@/lib/transcription";
import { coverage, traceSection } from "@/lib/trace";
import type { TemplateSection } from "@/db/schema";

const SECTIONS: TemplateSection[] = [
  { key: "subjective", text: "", label: "Subjective", guidance: "What the client reported." } as unknown as TemplateSection,
  { key: "objective", label: "Objective", guidance: "What was observed and delivered." },
  { key: "assessment", label: "Assessment", guidance: "Clinical formulation." },
  { key: "plan", label: "Plan", guidance: "Next steps and homework." },
];

const segments = [
  { speaker: 0, startMs: 0, endMs: 6_000, text: "How was the week?" },
  { speaker: 1, startMs: 6_000, endMs: 15_000, text: "Hard. I rated the anxiety 8/10 on Thursday." },
  { speaker: 0, startMs: 15_000, endMs: 22_000, text: "For homework I'd like the thought record at onset." },
  { speaker: 1, startMs: 22_000, endMs: 28_000, text: "I can do that this week." },
];

const input: DraftInput = {
  sections: SECTIONS,
  format: "soap",
  modality: "cbt",
  segments,
  durationMinutes: 50,
};

describe("prompt assembly", () => {
  it("carries the section's own guidance, the modality and the offsets", () => {
    const { system, user } = buildSectionPrompt(input, SECTIONS[1]);
    assert.match(system, /Cite your sources/);
    assert.match(system, /Never invent numbers/);
    assert.match(user, /Modality: CBT/);
    assert.match(user, /Guidance for this section: What was observed/);
    assert.match(user, /\[6000-15000\] CLIENT: Hard\./);
  });

  it("uses the shorthand system prompt and cites nothing when there is no tape", () => {
    const { system, user } = buildSectionPrompt(
      { ...input, segments: [], shorthandText: "exposure step 3, HW step 4 twice" },
      SECTIONS[3],
    );
    assert.match(system, /There is no recording, so cite nothing/);
    assert.match(user, /exposure step 3/);
    assert.doesNotMatch(user, /Transcript/);
  });

  it("labels speakers without claiming the labels are right", () => {
    assert.match(renderTranscript(segments), /^\[0-6000\] CLINICIAN: How was the week\?/);
    assert.match(buildSectionPrompt(input, SECTIONS[0]).user, /may be wrong/);
  });
});

describe("validation of what came back", () => {
  it("accepts well-formed output and keeps real citations", () => {
    const section = validateSection(
      {
        sentences: [
          {
            text: "Client reported the week as hard and rated anxiety 8/10 on Thursday.",
            spans: [{ startMs: 6_000, endMs: 15_000 }],
          },
        ],
      },
      SECTIONS[0],
      segments,
    );
    assert.equal(section.sentences.length, 1);
    assert.deepEqual(section.sourceSpans, [{ startMs: 6_000, endMs: 15_000 }]);
    assert.equal(traceSection(section, { hasTranscript: true })[0].kind, "traced");
  });

  it("drops a span that points at nothing and flags the sentence", () => {
    const section = validateSection(
      {
        sentences: [
          {
            text: "Client denied any suicidal ideation.",
            // A hallucinated offset well past the end of a 28-second transcript.
            spans: [{ startMs: 900_000, endMs: 960_000 }],
          },
        ],
      },
      SECTIONS[0],
      segments,
    );
    assert.deepEqual(section.sentences[0].sourceSpans, [], "the fake citation is discarded");
    assert.equal(
      traceSection(section, { hasTranscript: true })[0].kind,
      "unsourced",
      "and the sentence is flagged rather than kept as sourced",
    );
  });

  it("repairs a reversed span rather than throwing it away", () => {
    const section = validateSection(
      { sentences: [{ text: "Homework was agreed.", spans: [{ startMs: 22_000, endMs: 15_000 }] }] },
      SECTIONS[3],
      segments,
    );
    assert.deepEqual(section.sentences[0].sourceSpans, [{ startMs: 15_000, endMs: 22_000 }]);
  });

  it("refuses output that does not match the schema", () => {
    for (const bad of [
      null,
      {},
      { sentences: [] },
      { sentences: [{ text: "", spans: [] }] },
      { sentences: [{ text: "ok", spans: [{ startMs: "x", endMs: 1 }] }] },
      "the model wrote prose instead",
    ]) {
      assert.throws(
        () => validateSection(bad, SECTIONS[0], segments),
        DraftValidationError,
        `should have refused ${JSON.stringify(bad)}`,
      );
    }
  });

  it("never claims a citation on a shorthand note", () => {
    const section = validateSection(
      { sentences: [{ text: "Homework assigned.", spans: [{ startMs: 0, endMs: 1_000 }] }] },
      SECTIONS[3],
      [],
    );
    assert.deepEqual(section.sentences[0].sourceSpans, []);
  });
});

describe("the built-in fixture drafter", () => {
  it("produces a section per template section, all traceable", () => {
    const result = fixtureDraft(input);
    assert.equal(result.sections.length, 4);
    assert.equal(result.fixture, true);
    assert.match(result.model, /^fixture/);
    const cov = coverage(result.sections, { hasTranscript: true });
    assert.ok(cov.sentences > 0);
    assert.equal(cov.unsourced, 0, "an extractive drafter cannot produce an unsourced claim");
  });

  it("cites only spans that exist in the transcript", () => {
    for (const section of fixtureDraft(input).sections) {
      for (const sentence of section.sentences) {
        for (const span of sentence.sourceSpans) {
          assert.ok(
            segments.some((s) => s.startMs < span.endMs && span.startMs < s.endMs),
            `span ${JSON.stringify(span)} must overlap a real segment`,
          );
        }
      }
    }
  });

  it("is deterministic for the same session", () => {
    assert.deepEqual(fixtureDraft(input).sections, fixtureDraft(input).sections);
  });

  it("expands shorthand without inventing clinical content", () => {
    const shorthand = "worked on exposure hierarchy, client reported 4/10 anxiety, HW assigned";
    const result = fixtureDraft({
      ...input,
      segments: [],
      shorthandText: shorthand,
    });
    const words = result.sections.flatMap((s) => s.text.toLowerCase().split(/\W+/));
    // Every content word has to come from the clinician's own shorthand, or be
    // the explicit "not recorded" line.
    const allowed = new Set([
      ...shorthand.toLowerCase().split(/\W+/),
      ...`not recorded in the clinician's shorthand for this session complete before signing`.split(
        /\W+/,
      ),
      "",
    ]);
    const invented = words.filter((w) => w && !allowed.has(w));
    assert.deepEqual(invented, [], `the drafter invented: ${invented.join(", ")}`);
    for (const section of result.sections) {
      assert.deepEqual(section.sourceSpans, [], "shorthand cites nothing");
    }
  });

  it("works against every fixture transcript the ASR fake can produce", () => {
    for (const modality of ["general", "cbt", "emdr", "couples"] as const) {
      const transcript = fixtureTranscript({
        audio: Buffer.alloc(2048),
        mime: "audio/webm",
        modality,
        durationSeconds: 3_000,
      });
      const result = fixtureDraft({ ...input, modality, segments: transcript.segments });
      for (const section of result.sections) {
        assert.ok(section.text.length > 0, `${modality}/${section.key} must not be empty`);
      }
    }
  });
});

describe("per-note cost telemetry", () => {
  it("prices the models the product actually uses", () => {
    // $3/MTok in, $15/MTok out on Sonnet: 10k in + 2k out = $0.06.
    assert.equal(costMicrosFor("claude-sonnet-5", 10_000, 2_000), 60_000);
    assert.equal(costMicrosFor("claude-haiku-4-5", 10_000, 2_000), 20_000);
    assert.equal(costMicrosFor("claude-opus-5", 10_000, 2_000), 100_000);
  });

  it("returns zero rather than guessing for an unknown model", () => {
    assert.equal(costMicrosFor("fixture-extractive/1", 1_000, 1_000), 0);
  });
});
