"use client";

/**
 * The finding card and the product's one animation.
 *
 * DESIGN.md, exactly: `panel`, radius 12, padding 16; the level Label with its
 * 6px dot; the reason as the Title; the mono pointer path in diffdim, tappable
 * to copy; the mini-diff in the card's own `overflow-x` track; the consumer
 * impact row; and an `ack` quiet action.
 *
 * **The strike-draw.** The removed line in the mini-diff gets a 1.5px break
 * strikethrough drawn left to right in 240ms, once per diff view, on the top
 * three breaking findings only, staggered 40ms — then the verdict word stamps
 * in. Everything after the third breaking finding appears already settled.
 * `prefers-reduced-motion` renders the strike complete instantly (handled in
 * globals.css) so nothing is motion-only.
 *
 * **The ack.** Hold for 600ms *and* write a note. Two deliberate frictions,
 * both from DESIGN.md: recording intent is the interaction.
 */

import { useActionState, useEffect, useRef, useState } from "react";
import { acknowledgeAction, withdrawAckAction } from "../actions";
import { EMPTY_STATE } from "@/lib/form-state";
import { CopyMono } from "@/components/CopyMono";
import { LevelLabel } from "@/components/Verdict";
import { IconAck } from "@/components/icons";

export interface FindingView {
  id: string;
  ruleId: string;
  level: "breaking" | "risky" | "compatible" | "info";
  defaultLevel: "breaking" | "risky" | "compatible" | "info";
  jsonPointer: string;
  endpoint: string | null;
  method: string | null;
  message: string;
  why: string;
  diffLines: Array<{ kind: "ctx" | "del" | "add"; text: string }>;
  impactedConsumers: string[];
  acknowledged: boolean;
}

const HOLD_MS = 600;

export function FindingCard({
  finding,
  diffId,
  index,
  strikeRank,
  fromPr,
}: {
  finding: FindingView;
  diffId: string;
  index: number;
  /** 0-based position among breaking findings, or -1. Only 0-2 animate. */
  strikeRank: number;
  fromPr: boolean;
}) {
  const animateStrike = strikeRank >= 0 && strikeRank < 3;
  const promoted = finding.level !== finding.defaultLevel && !finding.acknowledged;

  return (
    <article
      className="card settle"
      style={{ ["--settle-delay" as string]: `${Math.min(index, 8) * 24}ms` }}
    >
      <div className="finding-split">
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
            <LevelLabel level={finding.level} />
            {promoted ? (
              <span className="t-label" style={{ color: "var(--color-text-2)" }}>
                policy: was {finding.defaultLevel}
              </span>
            ) : null}
          </div>

          <h3 className="t-title" style={{ margin: "0 0 8px" }}>
            {finding.message}
          </h3>

          {finding.endpoint ? (
            <p className="t-data" style={{ color: "var(--color-text-2)", margin: "0 0 8px" }}>
              {finding.method} {finding.endpoint}
            </p>
          ) : (
            <p className="t-data" style={{ color: "var(--color-text-2)", margin: "0 0 8px" }}>
              API-wide
            </p>
          )}

          <p className="t-secondary" style={{ margin: "0 0 4px" }}>
            {finding.why}
          </p>

          <div className="xscroll">
            <CopyMono value={finding.jsonPointer} label={`JSON pointer ${finding.jsonPointer}`} />
          </div>

          {finding.diffLines.length > 0 ? (
            <div className="minidiff xscroll" aria-label="Excerpt of the change">
              {finding.diffLines.map((line, i) => (
                <div className="minidiff-line" key={`${i}-${line.text}`}>
                  <span className="minidiff-no">{line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "}</span>
                  <span
                    className={`minidiff-text ${
                      line.kind === "del" && animateStrike ? "strike strike-draw" : ""
                    }`}
                    data-kind={line.kind}
                    style={
                      line.kind === "del" && animateStrike
                        ? ({ ["--strike-delay" as string]: `${strikeRank * 40}ms` } as React.CSSProperties)
                        : undefined
                    }
                  >
                    {line.text}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div style={{ minWidth: 0 }}>
          {finding.impactedConsumers.length > 0 ? (
            <p className="t-secondary" style={{ margin: "12px 0 0" }}>
              <span className="level-label t-label" data-level={finding.level}>
                Breaks:
              </span>{" "}
              {finding.impactedConsumers.join(" · ")}
            </p>
          ) : finding.level === "breaking" || finding.level === "risky" ? (
            <p className="t-secondary" style={{ margin: "12px 0 0", color: "var(--color-text-3-aa)" }}>
              No declared consumer reads this. Add one in Consumers to know for certain.
            </p>
          ) : null}

          <AckControl finding={finding} diffId={diffId} fromPr={fromPr} />
        </div>
      </div>
    </article>
  );
}

function AckControl({
  finding,
  diffId,
  fromPr,
}: {
  finding: FindingView;
  diffId: string;
  fromPr: boolean;
}) {
  const [open, setOpen] = useState(false);
  /** Keyboard-armed: the first Enter/Space, awaiting the second. */
  const [armed, setArmed] = useState(false);
  const [holding, setHolding] = useState(false);
  const [note, setNote] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const [ackState, ackFormAction, ackPending] = useActionState(acknowledgeAction, EMPTY_STATE);
  const [withdrawState, withdrawFormAction, withdrawPending] = useActionState(withdrawAckAction, EMPTY_STATE);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (finding.acknowledged) {
    return (
      <form action={withdrawFormAction} style={{ marginTop: 16 }}>
        <input type="hidden" name="diffId" value={diffId} />
        <input type="hidden" name="ruleId" value={finding.ruleId} />
        <input type="hidden" name="jsonPointer" value={finding.jsonPointer} />
        <button type="submit" className="btn-quiet" disabled={withdrawPending}>
          {withdrawPending ? "Withdrawing…" : "Withdraw acknowledgement"}
        </button>
        {withdrawState.error ? (
          <p role="alert" className="t-secondary" style={{ color: "var(--color-break-text)" }}>
            {withdrawState.error}
          </p>
        ) : null}
      </form>
    );
  }

  if (finding.level === "compatible") return null;

  /**
   * Hold-to-confirm, DESIGN.md's version: one gesture. Completing the 600ms
   * hold *is* the confirmation, so the form submits when the radial fill
   * finishes rather than waiting for a second tap.
   *
   * The earlier two-step (hold, then tap "Confirm") was both off-spec and
   * subtly broken: releasing the pointer after the hold completed fired an
   * ordinary click on a button that had just become `type="submit"`, so it
   * submitted on release anyway and the confirm label was a state nobody could
   * reach deliberately.
   */
  function startHold() {
    if (note.trim().length < 8) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      setHolding(false);
      formRef.current?.requestSubmit();
    }, HOLD_MS);
  }

  function cancelHold() {
    if (timer.current) clearTimeout(timer.current);
    setHolding(false);
  }

  if (!open) {
    return (
      <div style={{ marginTop: 16 }}>
        <button type="button" className="btn-quiet" onClick={() => setOpen(true)} id={`ack-${finding.id}`}>
          <IconAck size={18} />
          Acknowledge
        </button>
        {ackState.ok ? (
          <p role="status" className="t-secondary" style={{ color: "var(--color-green)", margin: "8px 0 0" }}>
            {ackState.ok}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form ref={formRef} action={ackFormAction} style={{ marginTop: 16, display: "grid", gap: 12 }}>
      <input type="hidden" name="diffId" value={diffId} />
      <input type="hidden" name="ruleId" value={finding.ruleId} />
      <input type="hidden" name="jsonPointer" value={finding.jsonPointer} />

      <label className="field">
        <span className="t-label">Why is this intentional?</span>
        <textarea
          className="textarea"
          name="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          minLength={8}
          required
          rows={3}
          placeholder="Deliberate removal — cancelled orders now report refunded. Acme was told on 2 Aug."
        />
        <span className="field-hint">
          Kept in the timeline and the audit log forever. Consumers read this, so write it for them.
        </span>
      </label>

      {fromPr ? (
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="t-label" style={{ color: "var(--color-text-2)", marginBottom: 8 }}>
            Scope
          </legend>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label className="chip" style={{ cursor: "pointer" }}>
              <input type="radio" name="scope" value="pr" defaultChecked style={{ accentColor: "var(--color-break)" }} />
              This pull request
            </label>
            <label className="chip" style={{ cursor: "pointer" }}>
              <input type="radio" name="scope" value="api" style={{ accentColor: "var(--color-break)" }} />
              This API, always
            </label>
          </div>
        </fieldset>
      ) : (
        <input type="hidden" name="scope" value="api" />
      )}

      {ackState.error ? (
        <p role="alert" className="t-secondary" style={{ color: "var(--color-break-text)", margin: 0 }}>
          {ackState.error}
        </p>
      ) : null}

      <div style={{ position: "relative" }}>
        <button
          type={armed ? "submit" : "button"}
          className={`btn btn-secondary btn-full ${holding ? "hold-active" : ""}`}
          disabled={ackPending || note.trim().length < 8}
          onPointerDown={startHold}
          onPointerUp={cancelHold}
          onPointerLeave={cancelHold}
          onKeyDown={(event) => {
            // A hold gesture with no keyboard equivalent is not an accessible
            // control, so the keyboard gets the same two beats without needing a
            // 600ms press: Enter or Space arms the button, the next one submits.
            if ((event.key === "Enter" || event.key === " ") && !armed) {
              event.preventDefault();
              setArmed(true);
            }
          }}
          onBlur={() => setArmed(false)}
          style={{ position: "relative", overflow: "hidden" }}
        >
          <span className="hold-track" aria-hidden="true">
            <span className="hold-fill" />
          </span>
          <span style={{ position: "relative" }}>
            {ackPending
              ? "Recording…"
              : note.trim().length < 8
                ? "Write a note first"
                : armed
                  ? "Press again to acknowledge"
                  : "Hold to acknowledge"}
          </span>
        </button>
      </div>

      <button type="button" className="btn-quiet" onClick={() => { setOpen(false); setArmed(false); }}>
        Cancel
      </button>
    </form>
  );
}
