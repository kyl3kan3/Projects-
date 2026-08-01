"use client";

/**
 * The hero: the product running inside five seconds.
 *
 * A real funder card with the real component, drawing a real score from the real
 * scoring function — the arc, the count-up, the underline sweep, the factor rows
 * that explain the number. Marketing law 2 says show the machine running, and law 5
 * says never fabricate: so the funder is one of the app's own sample records and it
 * is labelled as one, right on the card.
 */

import { useEffect, useState } from "react";
import { FitPanel } from "@/components/FitArc";
import { scoreFunder, type ScoringFunder, type ScoringProfile } from "@/lib/fit-score";

const PROFILE: ScoringProfile = {
  mission:
    "After-school tutoring and a summer literacy camp for 240 students in Cuyahoga County.",
  serviceStates: ["OH"],
  causeCodes: ["youth", "education"],
  typicalAskCents: 1_000_000,
  budgetBand: "100k_500k",
};

const APPLY: ScoringFunder = {
  name: "Sample Community Foundation of the Cuyahoga",
  statesFunded: ["OH", "MI"],
  causeCodes: ["youth", "education", "arts"],
  grantSizeMinCents: 500_000,
  grantSizeMaxCents: 2_500_000,
  acceptsUnsolicited: true,
  newGranteeShare: 0.38,
};

const SKIP: ScoringFunder = {
  name: "Sample National Literacy Endowment",
  statesFunded: ["US"],
  causeCodes: ["education", "youth"],
  grantSizeMinCents: 2_500_000,
  grantSizeMaxCents: 15_000_000,
  acceptsUnsolicited: false,
  newGranteeShare: 0.11,
};

export function HeroFit() {
  const [showing, setShowing] = useState<"apply" | "skip">("apply");

  // One flip, once, four seconds in: the apply/skip arithmetic makes itself. This is
  // beat one of the page's motion budget, and it does not loop.
  useEffect(() => {
    const timer = setTimeout(() => setShowing("skip"), 4200);
    return () => clearTimeout(timer);
  }, []);

  const funder = showing === "apply" ? APPLY : SKIP;
  const score = scoreFunder(PROFILE, funder, { profileVersion: 1, funderVersion: 1 });

  return (
    <div>
      <div className="flex gap-2 pb-3">
        <button
          type="button"
          className="chip"
          data-active={showing === "apply"}
          onClick={() => setShowing("apply")}
        >
          Apply
        </button>
        <button
          type="button"
          className="chip"
          data-active={showing === "skip"}
          onClick={() => setShowing("skip")}
        >
          Skip
        </button>
      </div>

      <article className="card p-4" key={funder.name}>
        <span className="t-label mb-2 inline-block" style={{ color: "var(--color-brick-text)" }}>
          Sample record — a demo, not a live opportunity
        </span>
        <h3 className="t-title relative inline-block name-sweep">{funder.name}</h3>
        <p className="t-secondary mt-1">
          {showing === "apply"
            ? "Youth development, education · OH/MI · typically $5k–$25k"
            : "Education & literacy, youth · national · typically $25k–$150k"}
        </p>
        <p className="t-data mt-2" style={{ color: "var(--color-ink-2)" }}>
          {showing === "apply" ? "DATA REVIEWED MAY 2026" : "DATA REVIEWED FEB 2026"}
        </p>
        <div className="mt-4 rule-t pt-3">
          <FitPanel score={score} subject={funder.name} defaultOpen />
        </div>
      </article>

      <p className="t-secondary mt-3" style={{ color: "var(--color-ink-2)" }}>
        Scored against one org profile: youth tutoring, Ohio, $10,000 ask. Same profile,
        both cards — the second is a long shot and says so.
      </p>
    </div>
  );
}
