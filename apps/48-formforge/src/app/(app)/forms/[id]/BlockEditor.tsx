"use client";

/**
 * A block's config, in a disclosure rather than a modal sheet.
 *
 * DESIGN.md asks for a config sheet at radius 20; a `<details>` gives the same
 * one-block-at-a-time focus, keeps the builder scrollable with the keyboard, and
 * works when JavaScript has not arrived. The panel it opens uses the sheet radius.
 *
 * It only exposes what a practice actually edits — headings, consent prose, the
 * disclosure sentence, screener choice. Field sets and CSV column names are the
 * export contract, and are deliberately not editable here.
 *
 * The text fields are controlled because React 19 resets an uncontrolled form once
 * its action resolves: a consent paragraph rejected by the validator would
 * otherwise be thrown away, which is the single worst place in this app to lose
 * someone's typing.
 */

import { useActionState, useState } from "react";
import { editBlockAction, type BuilderState } from "../actions";
import type { FormBlock } from "@/db/schema";
import { IconAlert } from "@/components/icons";

function str(config: Record<string, unknown>, key: string, fallback = ""): string {
  const value = config[key];
  return typeof value === "string" ? value : fallback;
}

function bool(config: Record<string, unknown>, key: string, fallback = false): boolean {
  const value = config[key];
  return typeof value === "boolean" ? value : fallback;
}

export function BlockEditor({
  formId,
  block,
  consentKeys,
}: {
  formId: string;
  block: FormBlock;
  consentKeys: string[];
}) {
  const [state, formAction, pending] = useActionState<BuilderState, FormData>(editBlockAction, {
    error: null,
  });

  const [heading, setHeading] = useState(str(block.config, "heading"));
  const [intro, setIntro] = useState(str(block.config, "intro"));
  const [body, setBody] = useState(str(block.config, "body"));
  const [disclosure, setDisclosure] = useState(str(block.config, "disclosure"));
  const [label, setLabel] = useState(str(block.config, "label"));
  const [help, setHelp] = useState(str(block.config, "help"));

  const editable =
    block.kind === "consent" ||
    block.kind === "signature" ||
    block.kind === "upload" ||
    block.kind === "history" ||
    block.kind === "demographics" ||
    block.kind === "insurance";

  if (!editable) {
    return (
      <p className="t-secondary mt-3" style={{ color: "var(--color-ink-3)" }}>
        Screener wording and scoring are fixed by the instrument — that is what makes the score
        comparable.
      </p>
    );
  }

  return (
    <details className="mt-3">
      <summary className="btn-quiet" style={{ cursor: "pointer" }}>
        Edit this block
      </summary>
      <form
        action={formAction}
        className="mt-3 p-4"
        style={{
          border: "1px solid var(--color-hairline)",
          borderRadius: "var(--radius-sheet)",
          background: "var(--color-linen)",
        }}
      >
        <input type="hidden" name="formId" value={formId} />
        <input type="hidden" name="blockKey" value={block.key} />

        <label className="field">
          <span className="field-label">Heading shown to the patient</span>
          <input
            className="input"
            name="config.heading"
            value={heading}
            onChange={(e) => setHeading(e.target.value)}
            required
          />
        </label>

        {block.kind === "history" && (
          <label className="field">
            <span className="field-label">Intro paragraph (optional)</span>
            <textarea
              className="input"
              name="config.intro"
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              rows={3}
            />
          </label>
        )}

        {block.kind === "consent" && (
          <>
            <label className="field">
              <span className="field-label">Consent text</span>
              <textarea
                className="input"
                name="config.body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={12}
                required
              />
              <span className="field-help">
                Blank lines separate paragraphs. This exact text is snapshotted at publish and
                copied onto every signature — editing it here changes the next version, never a
                past one.
              </span>
            </label>
            <label className="choice mb-4">
              <input
                type="checkbox"
                name="config.requireScroll"
                defaultChecked={bool(block.config, "requireScroll", true)}
                style={{ width: 20, height: 20, accentColor: "var(--color-teal)" }}
              />
              <span className="choice-label">Ask the patient to scroll to the end</span>
            </label>
          </>
        )}

        {block.kind === "signature" && (
          <>
            <label className="field">
              <span className="field-label">Consent-to-sign disclosure</span>
              <textarea
                className="input"
                name="config.disclosure"
                value={disclosure}
                onChange={(e) => setDisclosure(e.target.value)}
                rows={4}
                required
              />
              <span className="field-help">
                Stored with every signature and printed in the evidence summary. ESIGN and UETA both
                turn on the signer having seen a sentence like this.
              </span>
            </label>
            <label className="field">
              <span className="field-label">Signs which consent block</span>
              <select
                className="input"
                name="config.consentBlockKey"
                defaultValue={str(block.config, "consentBlockKey")}
              >
                {consentKeys.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </label>
            <label className="choice mb-4">
              <input
                type="checkbox"
                name="config.allowDrawn"
                defaultChecked={bool(block.config, "allowDrawn", true)}
                style={{ width: 20, height: 20, accentColor: "var(--color-teal)" }}
              />
              <span className="choice-label">Allow a drawn signature as well as a typed one</span>
            </label>
          </>
        )}

        {block.kind === "upload" && (
          <>
            <label className="field">
              <span className="field-label">What to upload</span>
              <input
                className="input"
                name="config.label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Helper text</span>
              <input
                className="input"
                name="config.help"
                value={help}
                onChange={(e) => setHelp(e.target.value)}
              />
            </label>
            <label className="choice mb-4">
              <input
                type="checkbox"
                name="config.required"
                defaultChecked={bool(block.config, "required")}
                style={{ width: 20, height: 20, accentColor: "var(--color-teal)" }}
              />
              <span className="choice-label">Required</span>
            </label>
            <p className="field-help mb-4">
              JPEG, PNG or PDF up to 8MB. Files are encrypted with your practice key before they are
              stored.
            </p>
          </>
        )}

        {state.error && (
          <p
            className="mb-4 flex items-start gap-2 text-[13px] leading-[1.45]"
            style={{ color: "var(--color-clay)" }}
            role="alert"
          >
            <IconAlert size={18} />
            <span>{state.error}</span>
          </p>
        )}

        <button className="btn btn-secondary" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save block"}
        </button>
      </form>
    </details>
  );
}
