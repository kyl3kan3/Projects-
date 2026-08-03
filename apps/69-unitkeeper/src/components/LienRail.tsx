/**
 * LienRail — the signature element (DESIGN.md).
 *
 * A vertical rail of dated statutory steps: completed nodes filled ink with their
 * date in mono, the current step outlined roll-door, future steps dashed and
 * carrying the hard-stop sentence in lien-card ("Earliest permitted sale date not
 * before June 28, 2026 — Tex. Prop. Code § 59.044").
 *
 * It is a server component and takes no callbacks: the action for a step is a
 * separate form on the page, so the rail stays a read-only statement of where the
 * clock is. The disabled button is part of the design — restraint, rendered.
 */

import { IconCheck } from "@/components/icons";
import type { TimelineStep } from "@/lib/lien-engine";
import { requirementLabel } from "@/lib/lien-rules";
import { formatDate } from "@/lib/money";

export interface LienRailProps {
  steps: TimelineStep[];
  /** Rendered under the matching step — the action form, when there is one. */
  actionFor?: (step: TimelineStep) => React.ReactNode;
}

export function LienRail({ steps, actionFor }: LienRailProps) {
  return (
    <ol className="rail">
      {steps.map((step) => {
        const state = step.completedOn ? "done" : step.current ? "current" : "locked";
        return (
          <li className="rail-step" key={step.key} data-state={state}>
            <span className="rail-node" aria-hidden="true">
              {step.completedOn ? <IconCheck size={13} /> : null}
            </span>
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <p className="t-title">{step.label}</p>
                <span className="t-mono" style={{ color: "var(--color-dim)" }}>
                  {step.completedOn ? formatDate(step.completedOn, { year: true }) : formatDate(step.dueOn, { year: true })}
                </span>
              </div>

              <p className="rail-citation" style={{ marginTop: 2 }}>
                {step.citation}
                {step.requires.length > 0
                  ? ` · ${step.requires.map(requirementLabel).join(" · ")}`
                  : ""}
              </p>

              {step.completedOn ? (
                <p className="t-mono" style={{ marginTop: 6, color: "var(--color-moss-strong)" }}>
                  Recorded {step.completedOn}
                  {step.trackingNumber ? ` · tracking ${step.trackingNumber}` : ""}
                </p>
              ) : null}

              {step.lockSentence ? (
                <p className="rail-stop" style={{ marginTop: 6 }}>
                  {step.lockSentence}
                </p>
              ) : null}

              {!step.completedOn && !step.locked ? (
                <p className="t-secondary" style={{ marginTop: 6 }}>
                  {step.instruction}
                </p>
              ) : null}

              {actionFor ? <div style={{ marginTop: 12 }}>{actionFor(step)}</div> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
