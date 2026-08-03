"use client";

import { useState } from "react";
import { money } from "@/lib/format";

/**
 * The overdue-list calculator — MARKETING_PLAYBOOK's "the math", calculated in
 * front of the visitor rather than asserted. It is also the lead magnet from
 * README's go-to-market channel 2.
 *
 * It is deliberately honest about being an estimate, and the recovered figure uses
 * a 10% reactivation rate — the low end of what the cited benchmarks report,
 * because a number the dentist can beat sells better than one they cannot.
 */
export function Calculator() {
  const [patients, setPatients] = useState(2000);
  const [overduePct, setOverduePct] = useState(30);
  const [visitValue, setVisitValue] = useState(300);

  const overduePatients = Math.round((patients * overduePct) / 100);
  const sittingCents = overduePatients * visitValue * 100;
  const recoveredCents = Math.round(sittingCents * 0.1);

  return (
    <div className="card" style={{ padding: 20, display: "grid", gap: 16 }}>
      <Row
        label="Active patients"
        value={patients}
        min={200}
        max={8000}
        step={100}
        onChange={setPatients}
        display={patients.toLocaleString("en-US")}
      />
      <Row
        label="Share overdue for hygiene"
        value={overduePct}
        min={10}
        max={45}
        step={1}
        onChange={setOverduePct}
        display={`${overduePct}%`}
      />
      <Row
        label="Value of a hygiene visit"
        value={visitValue}
        min={120}
        max={600}
        step={10}
        onChange={setVisitValue}
        display={money(visitValue * 100)}
      />

      <div className="hairline-t" style={{ paddingTop: 16 }}>
        <p className="t-label" style={{ margin: 0 }}>
          Sitting in your charts
        </p>
        <p className="t-stat" style={{ margin: "4px 0 0" }}>
          {money(sittingCents)}
        </p>
        <p className="t-secondary" style={{ margin: "8px 0 0" }}>
          {overduePatients.toLocaleString("en-US")} patients of record who should be in a chair. At a
          10% reactivation rate — the low end of the published benchmarks — that is{" "}
          <strong style={{ fontWeight: 500, color: "var(--color-ink)" }}>{money(recoveredCents)}</strong>{" "}
          of production, against {money(19_900)}–{money(29_900)} a month.
        </p>
        <p className="t-secondary" style={{ margin: "8px 0 0" }}>
          An estimate from your own three numbers. RecallDesk replaces it with your actual list on the
          first import.
        </p>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  display: string;
}) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span className="t-label">{label}</span>
        <span className="t-mono" style={{ fontSize: "1rem" }}>
          {display}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ width: "100%", accentColor: "var(--color-aqua)", minHeight: 44 }}
      />
    </label>
  );
}
