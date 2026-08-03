/**
 * The honesty constraint, tested structurally.
 *
 * This install can run with no ASR and no LLM configured, and when it does the
 * pipeline still produces a transcript and a draft — from built-in fixtures. That
 * is genuinely useful for evaluating the product and completely indefensible if a
 * clinician could mistake it for a transcript of their session.
 *
 * So the rule is: **every surface that renders note or transcript content must
 * carry the provenance notice**, and it is a source scan rather than a runtime
 * check because a screen that forgot the notice would look perfect. The same scan
 * covers the purged-media notice, which is the other thing a reader of a note
 * must not have to guess about.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  FIXTURE_DRAFT_NOTICE,
  FIXTURE_TRANSCRIPT_NOTICE,
  isFixtureDraft,
  isFixtureTranscript,
  provenanceLine,
  provenanceNotices,
  PURGED_MEDIA_NOTICE,
} from "@/lib/honesty";
import { fixtureDraft } from "@/lib/drafting";
import { fixtureTranscript } from "@/lib/transcription";

const SRC = join(process.cwd(), "src");
const read = (path: string) => readFileSync(join(SRC, path), "utf8");

/**
 * The surfaces that put note or transcript content in front of a person. Adding a
 * fourth is a deliberate act that fails this test until the notice comes with it.
 */
const RENDERERS = [
  "lib/notes.ts", // the plain-text render and the clipboard copy
  "lib/pdf.ts", // the signed-note export
  "app/(app)/notes/[id]/page.tsx", // the review room's data
];

describe("provenance notices exist and say what they mean", () => {
  it("names the fixture pipeline plainly", () => {
    assert.match(FIXTURE_TRANSCRIPT_NOTICE, /Demo transcript/);
    assert.match(FIXTURE_TRANSCRIPT_NOTICE, /not this session's audio/);
    assert.match(FIXTURE_DRAFT_NOTICE, /quoted from the transcript rather than composed/);
    assert.match(PURGED_MEDIA_NOTICE(30), /purged per your 30-day retention policy/);
  });

  it("detects fixture providers by what they actually write to the database", () => {
    const transcript = fixtureTranscript({
      audio: Buffer.alloc(2048),
      mime: "audio/webm",
      modality: "cbt",
    });
    assert.equal(transcript.provider, "fixture");
    assert.equal(isFixtureTranscript(transcript.provider), true);
    assert.equal(isFixtureTranscript("deepgram"), false);

    const draft = fixtureDraft({
      sections: [{ key: "plan", label: "Plan", guidance: "" }],
      format: "soap",
      modality: "cbt",
      segments: transcript.segments,
    });
    assert.equal(isFixtureDraft(draft.model), true);
    assert.equal(isFixtureDraft("claude-sonnet-5"), false);
  });

  it("returns both notices when both providers are fixtures, and none when neither is", () => {
    assert.deepEqual(
      provenanceNotices({ transcriptProvider: "fixture", noteModel: "fixture-extractive/1" }),
      [FIXTURE_TRANSCRIPT_NOTICE, FIXTURE_DRAFT_NOTICE],
    );
    assert.deepEqual(
      provenanceNotices({ transcriptProvider: "deepgram", noteModel: "claude-sonnet-5" }),
      [],
    );
    assert.equal(provenanceLine({ transcriptProvider: "deepgram", noteModel: null }), null);
    assert.match(provenanceLine({ noteModel: "fixture-extractive/1" }) ?? "", /built-in/);
  });
});

describe("every rendering surface carries the notice", () => {
  for (const path of RENDERERS) {
    it(`${path} calls the provenance helper`, () => {
      const source = read(path);
      assert.match(
        source,
        /provenance(Line|Notices)\(/,
        `${path} renders note content and must call provenanceLine/provenanceNotices`,
      );
    });
  }

  it("the review room renders the notices it is given", () => {
    const source = read("components/ReviewRoom.tsx");
    assert.match(source, /props\.notices\.map/, "the notices prop must be rendered");
    assert.match(source, /transcriptNote/, "the purged-media notice must be rendered");
  });

  it("the purged-media notice reaches the review room", () => {
    assert.match(read("app/(app)/notes/[id]/page.tsx"), /PURGED_MEDIA_NOTICE/);
  });

  it("the trust screen says which providers this install is really using", () => {
    const source = read("app/(app)/trust/page.tsx");
    assert.match(source, /asrConfigured\(\)/);
    assert.match(source, /llmConfigured\(\)/);
    assert.match(source, /fixture/i);
  });
});

describe("the fixture providers cannot pass themselves off as real ones", () => {
  it("the fixture transcriber is only chosen when no key is present", () => {
    const source = read("lib/transcription.ts");
    assert.match(source, /asrConfigured\(\)\s*\?\s*transcribeWithDeepgram/);
    // A provider error must not fall back to fixtures — that would silently turn a
    // failed transcription into fictional segments.
    assert.doesNotMatch(
      source.replace(/\/\*[\s\S]*?\*\//g, ""),
      /catch[\s\S]{0,120}fixtureTranscript/,
    );
  });

  it("the fixture drafter is only chosen when no key is present", () => {
    assert.match(read("lib/drafting.ts"), /llmConfigured\(\)\s*\n?\s*\?\s*draftWithAnthropic/);
  });
});
