"use client";

/**
 * The waiver builder (DESIGN.md "Waiver builder"): a block list of hairline rows
 * with inline config, plain-language expiry and minor rules, and a publish action
 * that stamps a mono version.
 *
 * The screen is explicit about the thing that matters legally: saving edits the
 * draft, publishing snapshots it, and neither touches a signature already given.
 */

import { useActionState, useState } from "react";
import type { ExpiryRule, MinorRule, WaiverBlock } from "@/db/schema";
import { IconPlus, IconTrash } from "@/components/icons";
import { saveWaiverAction, type WaiverFormState } from "../actions";

interface Props {
  waiverId: string;
  title: string;
  expiryRule: ExpiryRule;
  minorRule: MinorRule;
  blocks: WaiverBlock[];
  relationshipOptions: string[];
  hasSignatures: boolean;
  latestVersion: number | null;
}

const KIND_LABEL: Record<WaiverBlock["kind"], string> = {
  liability_text: "Liability text",
  initialed_clause: "Initialed clause",
  question: "Question",
  signature: "Signature block",
};

function str(config: Record<string, unknown>, key: string): string {
  const v = config[key];
  return typeof v === "string" ? v : "";
}

export function WaiverEditor(props: Props) {
  const [blocks, setBlocks] = useState<WaiverBlock[]>(props.blocks);
  const [state, save, busy] = useActionState<WaiverFormState, FormData>(saveWaiverAction, {});

  const update = (key: string, patch: Record<string, unknown>) =>
    setBlocks((bs) =>
      bs.map((b) => (b.key === key ? { ...b, config: { ...b.config, ...patch } } : b)),
    );

  const remove = (key: string) => setBlocks((bs) => bs.filter((b) => b.key !== key));

  const add = (kind: WaiverBlock["kind"]) => {
    const key = `${kind}_${Date.now().toString(36)}`;
    const config: Record<string, unknown> =
      kind === "liability_text"
        ? { heading: "New section", body: "" }
        : kind === "initialed_clause"
          ? { text: "", prompt: "Initial to agree" }
          : { label: "", kind: "text", required: false };
    setBlocks((bs) => {
      const sigIndex = bs.findIndex((b) => b.kind === "signature");
      const block: WaiverBlock = { key, kind, config };
      if (sigIndex === -1) return [...bs, block];
      return [...bs.slice(0, sigIndex), block, ...bs.slice(sigIndex)];
    });
  };

  return (
    <div>
      <form action={save} className="flex flex-col gap-5">
        <input type="hidden" name="waiverId" value={props.waiverId} />
        <input type="hidden" name="blocks" value={JSON.stringify(blocks)} />

        <label className="flex flex-col gap-2">
          <span className="t-label">Title</span>
          <input name="title" className="input" defaultValue={props.title} required />
        </label>

        <label className="flex flex-col gap-2">
          <span className="t-label">How long is a signature good for?</span>
          <select name="expiryRule" className="input" defaultValue={props.expiryRule}>
            <option value="visit">This visit only — expires at the end of the day</option>
            <option value="days_365">One year — 365 days from the date signed</option>
            <option value="forever">Until revoked — no expiry</option>
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <span className="t-label">Age of majority</span>
          <input
            name="ageOfMajority"
            type="number"
            min={16}
            max={25}
            className="input input-mono"
            defaultValue={props.minorRule.ageOfMajority}
          />
          <span className="t-secondary">
            Anyone under this age must be signed for by a parent or legal guardian. They can
            never sign for themselves, and neither can another minor.
          </span>
        </label>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="resignAtMajority"
            defaultChecked={props.minorRule.resignAtMajority}
            className="mt-1"
          />
          <span>
            <span className="t-title block">Re-sign on reaching the age of majority</span>
            <span className="t-secondary">
              A guardian&rsquo;s authority to bind someone ends when that person becomes an
              adult. With this on, a waiver signed for a 15-year-old stops covering them on
              their birthday and the check-in screen asks them to sign in their own name.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="guardianSignsForSelf"
            defaultChecked={props.minorRule.guardianSignsForSelf}
            className="mt-1"
          />
          <span>
            <span className="t-title block">The guardian also signs for themselves</span>
            <span className="t-secondary">
              Turn this on when the adult is participating too, not just supervising.
            </span>
          </span>
        </label>

        <p className="t-label mt-2">Blocks</p>
        <div>
          {blocks.map((b) => (
            <div key={b.key} className="hairline-b py-4">
              <div className="flex items-center justify-between gap-3">
                <span className="t-label">{KIND_LABEL[b.kind]}</span>
                {b.kind !== "signature" ? (
                  <button
                    type="button"
                    className="btn-quiet"
                    style={{ color: "var(--color-ember)" }}
                    onClick={() => remove(b.key)}
                    aria-label={`Remove ${KIND_LABEL[b.kind]}`}
                  >
                    <IconTrash size={16} />
                  </button>
                ) : null}
              </div>

              {b.kind === "liability_text" ? (
                <div className="mt-3 flex flex-col gap-3">
                  <input
                    className="input"
                    value={str(b.config, "heading")}
                    onChange={(e) => update(b.key, { heading: e.target.value })}
                    placeholder="Acknowledgement of risk"
                  />
                  <textarea
                    className="input"
                    rows={6}
                    value={str(b.config, "body")}
                    onChange={(e) => update(b.key, { body: e.target.value })}
                    placeholder="The clause your attorney gave you, verbatim."
                  />
                </div>
              ) : null}

              {b.kind === "initialed_clause" ? (
                <div className="mt-3 flex flex-col gap-3">
                  <textarea
                    className="input"
                    rows={3}
                    value={str(b.config, "text")}
                    onChange={(e) => update(b.key, { text: e.target.value })}
                    placeholder="The single point you want initialed separately."
                  />
                  <input
                    className="input"
                    value={str(b.config, "prompt")}
                    onChange={(e) => update(b.key, { prompt: e.target.value })}
                    placeholder="Initial to confirm…"
                  />
                </div>
              ) : null}

              {b.kind === "question" ? (
                <div className="mt-3 flex flex-col gap-3">
                  <input
                    className="input"
                    value={str(b.config, "label")}
                    onChange={(e) => update(b.key, { label: e.target.value })}
                    placeholder="Emergency contact phone"
                  />
                  <div className="flex flex-wrap gap-3">
                    <select
                      className="input w-auto flex-1"
                      value={str(b.config, "kind") || "text"}
                      onChange={(e) => update(b.key, { kind: e.target.value })}
                    >
                      <option value="text">Short text</option>
                      <option value="long_text">Long text</option>
                      <option value="phone">Phone</option>
                      <option value="email">Email</option>
                      <option value="yes_no">Yes / no</option>
                    </select>
                    <label className="chip" data-active={Boolean(b.config.required)}>
                      <input
                        type="checkbox"
                        checked={Boolean(b.config.required)}
                        onChange={(e) => update(b.key, { required: e.target.checked })}
                      />
                      Required
                    </label>
                    <label className="chip" data-active={Boolean(b.config.medical)}>
                      <input
                        type="checkbox"
                        checked={Boolean(b.config.medical)}
                        onChange={(e) => update(b.key, { medical: e.target.checked })}
                      />
                      Medical flag
                    </label>
                  </div>
                </div>
              ) : null}

              {b.kind === "signature" ? (
                <div className="mt-3 flex flex-col gap-3">
                  <textarea
                    className="input"
                    rows={3}
                    value={str(b.config, "disclosure")}
                    onChange={(e) => update(b.key, { disclosure: e.target.value })}
                    placeholder="Consent-to-sign disclosure shown above the signature."
                  />
                  <label className="chip w-fit" data-active={b.config.allowDrawn !== false}>
                    <input
                      type="checkbox"
                      checked={b.config.allowDrawn !== false}
                      onChange={(e) => update(b.key, { allowDrawn: e.target.checked })}
                    />
                    Allow a drawn signature
                  </label>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="mt-2 flex flex-wrap gap-3">
          <button type="button" className="btn btn-secondary" onClick={() => add("liability_text")}>
            <IconPlus size={16} />
            Text
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => add("initialed_clause")}
          >
            <IconPlus size={16} />
            Clause
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => add("question")}>
            <IconPlus size={16} />
            Question
          </button>
        </div>

        {state.error ? (
          <p className="t-secondary" style={{ color: "var(--color-ember)" }} role="alert">
            {state.error}
          </p>
        ) : state.ok ? (
          <p className="t-secondary" style={{ color: "var(--color-pine)" }} role="status">
            {state.ok}
          </p>
        ) : null}

        {props.hasSignatures ? (
          <p className="t-secondary">
            This waiver has signatures against version {props.latestVersion}. Publishing creates
            version {(props.latestVersion ?? 0) + 1}; the existing signatures keep the text they
            were given, word for word.
          </p>
        ) : null}

        <div className="action-bar flex flex-col gap-3">
          <button
            className="btn btn-primary btn-full"
            type="submit"
            name="intent"
            value="publish"
            disabled={busy}
          >
            {busy
              ? "Working…"
              : props.latestVersion
                ? `Save and publish version ${props.latestVersion + 1}`
                : "Publish version 1"}
          </button>
          <button
            className="btn btn-secondary btn-full"
            type="submit"
            name="intent"
            value="save"
            disabled={busy}
          >
            Save draft only
          </button>
        </div>
      </form>
    </div>
  );
}
