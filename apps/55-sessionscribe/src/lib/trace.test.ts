/**
 * Source tracing. This is the module behind the product's central honesty claim —
 * "every drafted sentence traces to the tape, and the ones that don't are
 * flagged" — so the tests are about the four kinds a sentence can be, and about
 * the clinical text that breaks naive sentence splitting.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coverage,
  normalizeSentence,
  overlaps,
  segmentsForSpans,
  sentencesForSegment,
  splitSentences,
  traceSection,
  unionSpans,
} from "@/lib/trace";
import type { NoteSection } from "@/db/schema";

describe("sentence splitting survives clinical prose", () => {
  it("splits on terminal punctuation", () => {
    assert.deepEqual(splitSentences("One thing. Two things! Three?"), [
      "One thing.",
      "Two things!",
      "Three?",
    ]);
  });

  it("keeps ratings intact", () => {
    // A naive split on "." turns "4/10." into a sentence boundary problem and
    // "8/10 at" into two. Both appear in every anxiety note ever written.
    assert.deepEqual(
      splitSentences("Anxiety was 8/10 at worst and 4.5/10 in session. Sleep improved."),
      ["Anxiety was 8/10 at worst and 4.5/10 in session.", "Sleep improved."],
    );
  });

  it("does not split after a known abbreviation", () => {
    assert.deepEqual(splitSentences("Dr. Alvarez led the session. SUDs fell to 2."), [
      "Dr. Alvarez led the session.",
      "SUDs fell to 2.",
    ]);
  });

  it("returns nothing for empty text", () => {
    assert.deepEqual(splitSentences("   "), []);
  });

  it("normalises for comparison without destroying meaning", () => {
    assert.equal(
      normalizeSentence('  "Client reported a hard week."  '),
      "client reported a hard week",
    );
  });
});

const segments = [
  { speaker: 0, startMs: 0, endMs: 5_000, text: "How was the week?" },
  { speaker: 1, startMs: 5_000, endMs: 12_000, text: "Hard. I did not sleep Wednesday." },
  { speaker: 0, startMs: 12_000, endMs: 18_000, text: "Where would you put it, nought to ten?" },
  { speaker: 1, startMs: 18_000, endMs: 24_000, text: "An eight on Thursday morning." },
];

function section(overrides: Partial<NoteSection> = {}): NoteSection {
  return {
    key: "subjective",
    text: "Client reported the week as hard. Client rated distress 8/10 on Thursday.",
    sourceSpans: [],
    sentences: [
      {
        text: "Client reported the week as hard.",
        sourceSpans: [{ startMs: 5_000, endMs: 12_000 }],
      },
      {
        text: "Client rated distress 8/10 on Thursday.",
        sourceSpans: [{ startMs: 18_000, endMs: 24_000 }],
      },
    ],
    ...overrides,
  };
}

describe("the four kinds a sentence can be", () => {
  it("marks a cited sentence traced", () => {
    const traced = traceSection(section(), { hasTranscript: true });
    assert.deepEqual(
      traced.map((s) => s.kind),
      ["traced", "traced"],
    );
    assert.equal(traced[0].spans.length, 1);
  });

  it("flags a model sentence with no citation as unsourced", () => {
    const traced = traceSection(
      section({
        text: "Client reported the week as hard. Client denied any suicidal ideation.",
        sentences: [
          {
            text: "Client reported the week as hard.",
            sourceSpans: [{ startMs: 5_000, endMs: 12_000 }],
          },
          // The dangerous case: a plausible clinical claim the tape never made.
          { text: "Client denied any suicidal ideation.", sourceSpans: [] },
        ],
      }),
      { hasTranscript: true },
    );
    assert.deepEqual(
      traced.map((s) => s.kind),
      ["traced", "unsourced"],
    );
    assert.equal(coverage([section()], { hasTranscript: true }).hasUnsourced, false);
  });

  it("treats a sentence the clinician rewrote as their own, not as unsourced", () => {
    const edited = section({
      text: "Client described the week as difficult. Client rated distress 8/10 on Thursday.",
    });
    const traced = traceSection(edited, { hasTranscript: true });
    assert.deepEqual(
      traced.map((s) => s.kind),
      ["clinician", "traced"],
    );
    assert.deepEqual(traced[0].spans, [], "clinician text claims no source");
  });

  it("treats a shorthand note as no-transcript rather than unsourced", () => {
    const traced = traceSection(
      { key: "plan", text: "Homework assigned. Next session Wednesday.", sourceSpans: [] },
      { hasTranscript: false },
    );
    assert.deepEqual(
      traced.map((s) => s.kind),
      ["no-transcript", "no-transcript"],
    );
    const cov = coverage(
      [{ key: "plan", text: "Homework assigned.", sourceSpans: [] }],
      { hasTranscript: false },
    );
    assert.equal(cov.hasUnsourced, false, "shorthand must never be flagged");
  });

  it("counts coverage across sections", () => {
    const cov = coverage(
      [
        section(),
        {
          key: "plan",
          text: "Thought record assigned. Client will call if worse.",
          sourceSpans: [],
          sentences: [
            { text: "Thought record assigned.", sourceSpans: [{ startMs: 0, endMs: 5_000 }] },
            { text: "Client will call if worse.", sourceSpans: [] },
          ],
        },
      ],
      { hasTranscript: true },
    );
    assert.equal(cov.sentences, 4);
    assert.equal(cov.traced, 3);
    assert.equal(cov.unsourced, 1);
    assert.equal(cov.hasUnsourced, true);
  });
});

describe("tracing works in both directions", () => {
  it("finds the segments a sentence cites", () => {
    assert.deepEqual(segmentsForSpans(segments, [{ startMs: 5_000, endMs: 12_000 }]), [1]);
    assert.deepEqual(segmentsForSpans(segments, []), []);
  });

  it("includes a segment that only partly overlaps the span", () => {
    assert.deepEqual(segmentsForSpans(segments, [{ startMs: 11_000, endMs: 13_000 }]), [1, 2]);
  });

  it("finds the sentences that cite a segment", () => {
    assert.deepEqual(
      sentencesForSegment([section()], segments[3], { hasTranscript: true }),
      ["subjective:1"],
    );
  });

  it("treats touching-but-not-overlapping spans as separate", () => {
    assert.equal(overlaps({ startMs: 0, endMs: 5_000 }, { startMs: 5_000, endMs: 9_000 }), false);
    assert.equal(overlaps({ startMs: 0, endMs: 5_001 }, { startMs: 5_000, endMs: 9_000 }), true);
  });
});

describe("span union", () => {
  it("merges overlapping and adjacent spans, sorted", () => {
    assert.deepEqual(
      unionSpans([
        { startMs: 5_000, endMs: 8_000 },
        { startMs: 0, endMs: 5_000 },
        { startMs: 20_000, endMs: 22_000 },
      ]),
      [
        { startMs: 0, endMs: 8_000 },
        { startMs: 20_000, endMs: 22_000 },
      ],
    );
  });

  it("is empty for no spans", () => {
    assert.deepEqual(unionSpans([]), []);
  });
});

describe("tracing survives quoted material (regression)", () => {
  /**
   * The extractive drafter quotes the transcript, so a drafted sentence can
   * contain full stops of its own. The first implementation split the section text
   * into sentences and looked each one up, which cut those quotes in half and
   * silently reported every sentence as untraceable clinician text. A rendered
   * screen caught it; this test keeps it caught.
   */
  const quoted: NoteSection = {
    key: "subjective",
    text:
      'Client reported: "Hard. I did not sleep Wednesday." Client rated distress: "An eight on Thursday morning."',
    sourceSpans: [],
    sentences: [
      {
        text: 'Client reported: "Hard. I did not sleep Wednesday."',
        sourceSpans: [{ startMs: 5_000, endMs: 12_000 }],
      },
      {
        text: 'Client rated distress: "An eight on Thursday morning."',
        sourceSpans: [{ startMs: 18_000, endMs: 24_000 }],
      },
    ],
  };

  it("keeps a quoted multi-sentence draft traceable as one sentence", () => {
    const traced = traceSection(quoted, { hasTranscript: true });
    assert.equal(traced.length, 2);
    assert.deepEqual(
      traced.map((s) => s.kind),
      ["traced", "traced"],
    );
    assert.equal(traced[0].spans.length, 1);
  });

  it("still reports clinician text added around a quoted sentence", () => {
    const edited: NoteSection = {
      ...quoted,
      text: `${quoted.text} Clinician added a line here.`,
    };
    const traced = traceSection(edited, { hasTranscript: true });
    assert.deepEqual(
      traced.map((s) => s.kind),
      ["traced", "traced", "clinician"],
    );
  });

  it("indexes sentences sequentially so the UI can key on them", () => {
    const traced = traceSection(
      { ...quoted, text: `Opening line by the clinician. ${quoted.text}` },
      { hasTranscript: true },
    );
    assert.deepEqual(
      traced.map((s) => s.index),
      [0, 1, 2],
    );
    assert.equal(traced[0].kind, "clinician");
  });
});
