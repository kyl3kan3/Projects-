"use client";

/**
 * The signature detail: the fit arc.
 *
 * A 28px arc draws from 0 to the score over 600ms while the mono number counts up
 * in step; the funder name gets a 1.5px gold underline sweep on settle. Pure SVG
 * stroke-dashoffset, so it is cheap on a phone. Reduced motion renders the arc
 * complete with a 100ms fade and a static number — feature-complete, not punitive.
 *
 * Two product rules are enforced by the component, not by whoever uses it:
 *
 *  - **There is no arc without reasons.** `score` is either a full FitScore with
 *    its factors or null. Null renders a dash and "Complete your profile to
 *    score" — never a zero, because zero would look like a judgement.
 *  - **The reasons are the point.** The arc is a summary of the rows below it, and
 *    the rows are always reachable: the toggle is a real button, expanded content
 *    is real text, and nothing about the score is motion-only.
 *
 * This file imports only from `lib/fit-score`, which is pure — no database client
 * can be dragged into the browser bundle through it.
 */

import { useEffect, useId, useRef, useState } from "react";
import { IconCheck, IconChevronDown, IconDash, IconX } from "@/components/icons";
import { fitVerdict, unknownCount, type FitScore } from "@/lib/fit-score";

const CIRCUMFERENCE = 75.398; // 2π × r, r = 12

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** Counts 0 → target in step with the arc. Static under reduced motion. */
function useCountUp(target: number, run: boolean, reduced: boolean): number {
  const [value, setValue] = useState(reduced ? target : 0);
  const frame = useRef<number>(0);

  useEffect(() => {
    if (reduced || !run) {
      setValue(target);
      return;
    }
    const started = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / 600);
      // ease-out-quart, so the number lands with the stroke.
      const eased = 1 - Math.pow(1 - t, 4);
      setValue(Math.round(target * eased));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, run, reduced]);

  return value;
}

export function FitArc({ total, animate = true }: { total: number; animate?: boolean }) {
  const reduced = usePrefersReducedMotion();
  const shown = useCountUp(total, animate, reduced);
  const offset = CIRCUMFERENCE * (1 - Math.max(0, Math.min(100, total)) / 100);

  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: 28, height: 28 }}
    >
      <svg width={28} height={28} viewBox="0 0 28 28" aria-hidden="true">
        <circle
          cx="14"
          cy="14"
          r="12"
          fill="none"
          stroke="var(--color-hairline)"
          strokeWidth="2"
        />
        <circle
          className={animate ? "fit-arc-value" : undefined}
          cx="14"
          cy="14"
          r="12"
          fill="none"
          /* The arc is a graphic whose value is repeated as the ink number in its
             centre, so it keeps DESIGN.md's exact gold. Text and lone glyphs use
             --color-gold-text, which measures 4.5:1. */
          stroke="var(--color-gold)"
          strokeWidth="2"
          strokeLinecap="round"
          transform="rotate(-90 14 14)"
          style={
            animate
              ? ({ "--arc-offset": offset } as React.CSSProperties)
              : { strokeDasharray: CIRCUMFERENCE, strokeDashoffset: offset }
          }
        />
      </svg>
      <span
        className="t-data absolute"
        style={{ fontSize: 11, letterSpacing: "-0.02em" }}
      >
        {shown}
      </span>
    </span>
  );
}

/** The dash the arc becomes when there is nothing honest to draw. */
export function FitArcEmpty() {
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: 28, height: 28 }}
      aria-hidden="true"
    >
      <svg width={28} height={28} viewBox="0 0 28 28">
        <circle
          cx="14"
          cy="14"
          r="12"
          fill="none"
          stroke="var(--color-hairline)"
          strokeWidth="2"
        />
      </svg>
      <span className="t-data absolute" style={{ fontSize: 11, color: "var(--color-ink-2)" }}>
        —
      </span>
    </span>
  );
}

function VerdictGlyph({ verdict }: { verdict: "match" | "miss" | "unknown" }) {
  if (verdict === "match") {
    return <IconCheck size={18} style={{ color: "var(--color-leaf-text)" }} />;
  }
  if (verdict === "miss") {
    return <IconX size={18} style={{ color: "var(--color-brick-text)" }} />;
  }
  return <IconDash size={18} style={{ color: "var(--color-ink-2)" }} />;
}

/**
 * The arc plus its expandable factor rows. `subject` names what is being scored,
 * so the disclosure button reads as a sentence to a screen reader rather than as
 * "expand, button".
 */
export function FitPanel({
  score,
  subject,
  missing,
  defaultOpen = false,
}: {
  score: FitScore | null;
  subject: string;
  /** What the profile still needs, when scoring is not possible. */
  missing?: string[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  if (!score) {
    return (
      <div className="flex items-start gap-3">
        <FitArcEmpty />
        <div className="min-w-0">
          <div className="t-label">No fit score</div>
          <p className="t-secondary mt-1">
            Complete your profile to score.
            {missing?.length ? ` We still need ${missing.join(", ")}.` : ""}
          </p>
        </div>
      </div>
    );
  }

  const unknowns = unknownCount(score);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 text-left"
        style={{ minHeight: 44, background: "none", border: 0, padding: 0 }}
      >
        <FitArc total={score.total} />
        <span className="min-w-0 flex-1">
          <span className="t-label" style={{ color: "var(--color-ink-2)" }}>
            Fit {score.total} / 100
          </span>
          <span className="t-secondary block" style={{ color: "var(--color-ink-2)" }}>
            {fitVerdict(score)}
            {score.longShot ? " · long shot" : ""}
          </span>
        </span>
        <IconChevronDown
          size={18}
          style={{
            color: "var(--color-ink-2)",
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 200ms var(--ease-out-quart)",
          }}
        />
      </button>

      {open ? (
        <div id={panelId} className="stagger mt-3">
          {score.factors.map((factor, i) => (
            <div
              key={factor.key}
              className="flex items-start gap-3 rule-t py-3"
              style={{ "--i": i } as React.CSSProperties}
            >
              <span className="mt-[2px]">
                <VerdictGlyph verdict={factor.verdict} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="t-label" style={{ color: "var(--color-ink-2)" }}>
                    {factor.label}
                  </span>
                  <span className="t-data" style={{ color: "var(--color-ink-2)" }}>
                    {factor.earned}/{factor.weight}
                  </span>
                </span>
                <span className="t-secondary mt-1 block">{factor.reason}</span>
              </span>
            </div>
          ))}
          <p className="t-secondary rule-t pt-3" style={{ color: "var(--color-ink-2)" }}>
            Scored on published giving records only — geography, cause areas, grant
            sizes, stated application policy and how often recent grantees were new.
            {unknowns > 0
              ? ` ${unknowns} of 5 factors could not be checked from the data on file.`
              : ""}{" "}
            GrantGrid has no insight into what {subject} privately prefers this year.
          </p>
        </div>
      ) : null}
    </div>
  );
}
