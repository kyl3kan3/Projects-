/**
 * The device: **the lien clock that runs itself.** Four beats, hold on the timeline.
 *
 *   1. the yard, drawn — and one door flips overdue at day 6
 *   2. the ladder steps fire: the fee posts, the overlock flag goes up
 *   3. the statutory timeline unrolls, each step with its citation
 *   4. the hard stop lands: "Sale eligible — not before"
 *
 * CSS keyframes only — no JS, no canvas, nothing on the mobile critical path. It is
 * HTML the whole way down, so the hero paints with the document. Under
 * `prefers-reduced-motion` every beat's delay is zeroed in globals.css and the
 * device renders as its final frame, which is the frame that matters.
 *
 * Every number in it is the real output of the seeded demo yard, and it is labelled
 * as a demo.
 */

import { LienRail } from "@/components/LienRail";
import type { TimelineStep } from "@/lib/lien-engine";

const DOORS: Array<{ label: string; status: string; flip?: boolean }> = [
  { label: "B-11", status: "occupied" },
  { label: "B-12", status: "occupied" },
  { label: "B-13", status: "vacant" },
  { label: "B-14", status: "occupied", flip: true },
  { label: "B-15", status: "occupied" },
  { label: "B-16", status: "lien" },
  { label: "B-17", status: "occupied" },
  { label: "B-18", status: "vacant" },
];

const LADDER: Array<{ day: string; text: string; tone: "dim" | "overdue" }> = [
  { day: "Day 3", text: "Card retried — declined", tone: "dim" },
  { day: "Day 6", text: "Late fee $20.00 posted to the ledger", tone: "overdue" },
  { day: "Day 11", text: "Overlock flagged · gate code 40318 off", tone: "overdue" },
];

/**
 * The rail exactly as the console renders it, from the Texas rule pack, for a
 * tenant delinquent since June 1st.
 */
const STEPS: TimelineStep[] = [
  {
    key: "default_notice",
    label: "Written notice of default and claim of lien",
    citation: "Tex. Prop. Code § 59.042",
    instruction: "Mail certified, return receipt requested.",
    requires: ["certified_mail", "inventory"],
    dueOn: "2026-06-01",
    completedOn: "2026-06-01",
    trackingNumber: "9407 1000 0000 4471 0092 18",
    noticeR2Key: null,
    locked: false,
    lockSentence: null,
    current: false,
  },
  {
    key: "waiting_period",
    label: "Statutory waiting period ends",
    citation: "Tex. Prop. Code § 59.043",
    instruction: "Nothing to do — the clock runs.",
    requires: [],
    dueOn: "2026-06-15",
    completedOn: "2026-06-15",
    trackingNumber: null,
    noticeR2Key: null,
    locked: false,
    lockSentence: null,
    current: false,
  },
  {
    key: "published_notice",
    label: "Publish notice of sale",
    citation: "Tex. Prop. Code § 59.044",
    instruction: "Publish in a newspaper of general circulation in the county.",
    requires: ["publication"],
    dueOn: "2026-06-22",
    completedOn: null,
    trackingNumber: null,
    noticeR2Key: null,
    locked: false,
    lockSentence: null,
    current: true,
  },
  {
    key: "sale",
    label: "Earliest permitted sale date",
    citation: "Tex. Prop. Code § 59.044",
    instruction: "The sale may be held on or after this date.",
    requires: [],
    dueOn: "2026-06-29",
    completedOn: null,
    trackingNumber: null,
    noticeR2Key: null,
    locked: true,
    lockSentence:
      "Earliest permitted sale date not before June 29, 2026 — Tex. Prop. Code § 59.044",
    current: false,
  },
];

export function MapToRail() {
  return (
    <div className="panel" style={{ padding: 20 }}>
      <div className="flex items-baseline justify-between gap-3" style={{ flexWrap: "wrap" }}>
        <p className="t-label">Riverbend Storage — Cedar Park</p>
        <p className="t-mono">138 of 160 — $18,420/mo</p>
      </div>

      {/* Beat 1 — the yard, and one door flips overdue. */}
      <div className="map-wrap device-beat" style={{ marginTop: 16, animationDelay: "80ms" }}>
        <div className="map-row">
          {DOORS.map((door) => (
            <span
              key={door.label}
              className={`door${door.flip ? " device-door-flip" : ""}`}
              data-status={door.status}
              aria-hidden="true"
            >
              <span className="door-label">{door.label}</span>
              <span className="door-size">10x10</span>
            </span>
          ))}
        </div>
      </div>
      <p className="t-secondary device-beat" style={{ marginTop: 12, animationDelay: "1000ms" }}>
        B-14 went unpaid. On day 6 the map paints it overdue — nobody typed anything.
      </p>

      {/* Beat 2 — the ladder steps fire. */}
      <ul
        className="hairline-t"
        style={{ listStyle: "none", padding: "12px 0 0", marginTop: 16 }}
      >
        {LADDER.map((step, i) => (
          <li
            key={step.day}
            className="device-beat"
            style={{
              animationDelay: `${1300 + i * 220}ms`,
              display: "flex",
              gap: 12,
              padding: "6px 0",
            }}
          >
            <span className="t-mono" style={{ width: 56, flex: "none", color: "var(--color-dim)" }}>
              {step.day}
            </span>
            <span
              className="t-secondary"
              style={{
                color: step.tone === "overdue" ? "var(--color-rolldoor-strong)" : undefined,
              }}
            >
              {step.text}
            </span>
          </li>
        ))}
      </ul>

      {/* Beats 3 and 4 — the timeline unrolls and the hard stop lands. */}
      <div
        className="hairline-t device-beat"
        style={{ marginTop: 16, paddingTop: 20, animationDelay: "2100ms" }}
      >
        <p className="t-label">Texas lien timeline · rule pack v1, reviewed 2026-01-15</p>
        <div style={{ marginTop: 16 }}>
          <LienRail steps={STEPS} />
        </div>
        <button className="btn btn-primary btn-full" type="button" disabled>
          Mark the sale done — not before June 29
        </button>
        <p className="t-secondary" style={{ marginTop: 8 }}>
          The button stays disabled until the statute says otherwise. That is the feature.
        </p>
      </div>
    </div>
  );
}
