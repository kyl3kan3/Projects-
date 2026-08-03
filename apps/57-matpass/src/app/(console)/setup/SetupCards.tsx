"use client";

import Link from "next/link";
import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { IconCheck } from "@/components/icons";
import {
  createKioskAction,
  firstGradingAction,
  importRosterAction,
  loadTemplateAction,
} from "./actions";

const SAMPLE_CSV = `Name,Family,Email,Rank,Stripes,Last promoted,Start date
Marcus Okafor,Okafor,dayo.okafor@example.com,Blue belt,2,2025-11-08,2023-02-14
Amara Okafor,Okafor,dayo.okafor@example.com,White belt,4,2026-01-17,2024-09-03
Sofia Reyes,Reyes,c.reyes@example.com,White belt,3,2025-12-20,2024-06-11
Tomas Lindqvist,Lindqvist,t.lindqvist@example.com,Blue belt,0,2026-04-04,2022-10-02
Priya Raman,Raman,priya.raman@example.com,White belt,1,2026-02-28,2025-08-19`;

export function SetupCards({
  templates,
  programs,
  studentCount,
  deviceCount,
  appUrl,
}: {
  templates: { key: string; program: string; description: string; rankCount: number; topRank: string }[];
  programs: { id: string; name: string; rankCount: number }[];
  studentCount: number;
  deviceCount: number;
  appUrl: string;
}) {
  const [csv, setCsv] = useState("");
  const hasCurriculum = programs.some((p) => p.rankCount > 0);

  return (
    <div className="flex flex-col" style={{ gap: 24, marginTop: 32 }}>
      {/* 1 — Curriculum */}
      <section className="card" style={{ padding: 20 }}>
        <div className="flex items-center gap-2">
          <p className="t-label">Step one</p>
          {hasCurriculum ? (
            <span className="green" aria-label="done">
              <IconCheck size={18} />
            </span>
          ) : null}
        </div>
        <h2 className="t-title" style={{ marginTop: 8 }}>
          Pick a curriculum
        </h2>
        <p className="t-secondary" style={{ marginTop: 4 }}>
          The rank ladder is the data model, not a custom field. Requirements come preloaded and
          every one of them is editable.
        </p>

        {programs.length > 0 ? (
          <div style={{ marginTop: 16 }}>
            {programs.map((program) => (
              <div key={program.id} className="row">
                <div style={{ flex: 1 }}>
                  <p className="t-title">{program.name}</p>
                  <p className="t-data fg-3" style={{ marginTop: 2 }}>
                    {program.rankCount} ranks
                  </p>
                </div>
              </div>
            ))}
            <Link href="/curriculum" className="btn-quiet" style={{ marginTop: 12 }}>
              Adjust the ladder
            </Link>
          </div>
        ) : null}

        <div style={{ marginTop: 16 }}>
          <ActionForm
            action={loadTemplateAction}
            submitLabel={programs.length > 0 ? "Add another program" : "Load this curriculum"}
            pendingLabel="Loading…"
            variant={programs.length > 0 ? "secondary" : "primary"}
          >
            <div className="field">
              <label className="t-label" htmlFor="template">
                Style
              </label>
              <select id="template" name="template" className="input" defaultValue={templates[0]?.key}>
                {templates.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.program} — {t.rankCount} ranks to {t.topRank}
                  </option>
                ))}
              </select>
              <p className="t-secondary fg-3">{templates[0]?.description}</p>
            </div>
          </ActionForm>
        </div>
      </section>

      {/* 2 — Roster */}
      <section className="card" style={{ padding: 20 }}>
        <div className="flex items-center gap-2">
          <p className="t-label">Step two</p>
          {studentCount > 0 ? (
            <span className="green" aria-label="done">
              <IconCheck size={18} />
            </span>
          ) : null}
        </div>
        <h2 className="t-title" style={{ marginTop: 8 }}>
          Import your students
        </h2>
        <p className="t-secondary" style={{ marginTop: 4 }}>
          Paste a spreadsheet or an export from your current system. Rank and last-promoted columns
          are honoured, so eligibility is right from day one. Siblings sharing a household collapse
          into one family with one payment method.
        </p>
        {studentCount > 0 ? (
          <p className="t-data" style={{ marginTop: 12 }}>
            {studentCount} student{studentCount === 1 ? "" : "s"} on the roster
          </p>
        ) : null}

        <div style={{ marginTop: 16 }}>
          <ActionForm
            action={importRosterAction}
            submitLabel="Import"
            pendingLabel="Importing…"
            disabled={!hasCurriculum}
            disabledReason="Load a curriculum first — students are placed on its ladder."
          >
            <div className="field">
              <label className="t-label" htmlFor="programId">
                Program
              </label>
              <select id="programId" name="programId" className="input">
                {programs
                  .filter((p) => p.rankCount > 0)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="field">
              <label className="t-label" htmlFor="csv">
                CSV
              </label>
              <textarea
                id="csv"
                name="csv"
                className="input input-mono"
                style={{ fontSize: 13, minHeight: 160 }}
                placeholder={"Name,Family,Email,Rank,Stripes,Last promoted\nMarcus Okafor,Okafor,dayo.okafor@example.com,Blue belt,2,2025-11-08"}
                value={csv}
                onChange={(event) => setCsv(event.target.value)}
              />
              <p className="t-secondary fg-3">
                Understood column names include Name (or First/Last), Family, Email, Phone, Program,
                Rank, Stripes, Last promoted, Start date, DOB and PIN — case and spacing do not
                matter.
              </p>
              <button
                type="button"
                className="btn-quiet"
                onClick={() => setCsv(SAMPLE_CSV)}
              >
                Fill in a five-student sample
              </button>
            </div>
          </ActionForm>
        </div>
      </section>

      {/* 3 — Kiosk */}
      <section className="card" style={{ padding: 20 }}>
        <div className="flex items-center gap-2">
          <p className="t-label">Step three</p>
          {deviceCount > 0 ? (
            <span className="green" aria-label="done">
              <IconCheck size={18} />
            </span>
          ) : null}
        </div>
        <h2 className="t-title" style={{ marginTop: 8 }}>
          Set up the door tablet
        </h2>
        <p className="t-secondary" style={{ marginTop: 4 }}>
          The kiosk holds a device token and nothing else — no staff login lives on the mat. Lose the
          tablet and you revoke it in one tap from settings.
        </p>
        {deviceCount > 0 ? (
          <p className="t-data" style={{ marginTop: 12 }}>
            {deviceCount} active device{deviceCount === 1 ? "" : "s"} ·{" "}
            <Link href="/settings/kiosk">manage</Link>
          </p>
        ) : null}
        <div style={{ marginTop: 16 }}>
          <ActionForm
            action={createKioskAction}
            submitLabel="Create a kiosk link"
            pendingLabel="Minting…"
            variant={deviceCount > 0 ? "secondary" : "primary"}
          >
            <div className="field">
              <label className="t-label" htmlFor="name">
                Device name
              </label>
              <input
                id="name"
                name="name"
                className="input"
                placeholder="Front door iPad"
                defaultValue="Front door iPad"
              />
              <p className="t-secondary fg-3">
                The link opens at {appUrl}/kiosk/… — bookmark it on the tablet home screen.
              </p>
            </div>
          </ActionForm>
        </div>
      </section>

      {/* The payoff */}
      <section className="card" style={{ padding: 20 }}>
        <p className="t-label">The payoff</p>
        <h2 className="t-title" style={{ marginTop: 8 }}>
          Let it assemble your first grading list
        </h2>
        <p className="t-secondary" style={{ marginTop: 4 }}>
          A date, your programs, and MatPass works out who is eligible and who is two classes short —
          from the roster you just imported.
        </p>
        <div style={{ marginTop: 16 }}>
          <ActionForm
            action={firstGradingAction}
            submitLabel="Assemble it"
            pendingLabel="Working…"
            disabled={studentCount === 0}
            disabledReason="Import some students first — there is nobody to assemble yet."
          />
        </div>
      </section>
    </div>
  );
}
