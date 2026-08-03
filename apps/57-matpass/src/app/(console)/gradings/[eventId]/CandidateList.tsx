"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { BeltBar, BeltTransition } from "@/components/belt-bar";
import { Pill, RequirementMath, SectionHead } from "@/components/ui";
import {
  candidateStatusAction,
  completeEventAction,
  inviteAction,
  reassembleAction,
} from "../actions";

export interface CandidateRow {
  candidateId: string;
  studentName: string;
  programName: string;
  rankName: string;
  beltColorHex: string;
  stripesEarned: number;
  stripesTotal: number;
  nextLabel: string;
  status: string;
  familyEmail: string | null;
  familyName: string;
  eligibility: {
    classesDone: number;
    classesRequired: number;
    daysDone: number;
    daysRequired: number;
    signoffRequired: boolean;
    signoffDone: boolean;
    missing: string[];
  };
}

export interface PreviewRow {
  candidateId: string;
  studentName: string;
  from: { beltColorHex: string; rankName: string; stripesEarned: number; stripesTotal: number };
  to: { beltColorHex: string; rankName: string; stripesEarned: number; stripesTotal: number };
}

type Tab = "eligible" | "near_miss";

export function CandidateList({
  eventId,
  canGrade,
  eligible,
  nearMiss,
  invited,
  previews,
}: {
  eventId: string;
  canGrade: boolean;
  eligible: CandidateRow[];
  nearMiss: CandidateRow[];
  invited: CandidateRow[];
  previews: PreviewRow[];
}) {
  const eligibleAll = [...invited, ...eligible];
  // Open on whichever list has somebody in it. Landing on an empty "Eligible"
  // tab while four near misses sit one tap away reads as "nobody is close",
  // which is the opposite of what the screen knows.
  const [tab, setTab] = useState<Tab>(
    eligibleAll.length === 0 && nearMiss.length > 0 ? "near_miss" : "eligible",
  );
  const [reviewing, setReviewing] = useState(false);
  const shown = tab === "eligible" ? eligibleAll : nearMiss;

  return (
    <>
      <div className="chip-row" style={{ marginTop: 24 }}>
        <button
          type="button"
          className="chip"
          data-active={tab === "eligible" ? "true" : undefined}
          onClick={() => setTab("eligible")}
        >
          Eligible · {eligibleAll.length}
        </button>
        <button
          type="button"
          className="chip"
          data-active={tab === "near_miss" ? "true" : undefined}
          onClick={() => setTab("near_miss")}
        >
          Near miss · {nearMiss.length}
        </button>
      </div>

      {shown.length === 0 ? (
        <p className="t-secondary fg-3" style={{ paddingTop: 32 }}>
          {tab === "eligible"
            ? "Nobody has met every requirement yet. The near-miss list shows who is closest and by how much."
            : "No near misses — everybody in these programs is either ready or a long way off."}
        </p>
      ) : (
        <div className="stagger" style={{ marginTop: 16 }}>
          {shown.map((candidate) => (
            <div key={candidate.candidateId} className="row-block">
              <div className="flex items-baseline justify-between gap-3">
                <p className="t-title">{candidate.studentName}</p>
                <span style={{ flex: "none" }}>
                  {candidate.status === "confirmed" ? (
                    <Pill tone="ok">Confirmed</Pill>
                  ) : candidate.status === "invited" ? (
                    <Pill tone="eligible">Invited</Pill>
                  ) : candidate.status === "eligible" ? (
                    <Pill tone="eligible">Eligible</Pill>
                  ) : (
                    <Pill tone="warn">Near miss</Pill>
                  )}
                </span>
              </div>
              <p className="t-secondary fg-3" style={{ marginTop: 2 }}>
                {candidate.programName} · {candidate.rankName} → {candidate.nextLabel}
              </p>
              <div style={{ marginTop: 8 }}>
                <BeltBar
                  beltColorHex={candidate.beltColorHex}
                  rankName={candidate.rankName}
                  stripesEarned={candidate.stripesEarned}
                  stripesTotal={candidate.stripesTotal}
                  classesDone={candidate.eligibility.classesDone}
                  classesRequired={candidate.eligibility.classesRequired}
                  met={candidate.eligibility.missing.length === 0}
                />
              </div>
              <div style={{ marginTop: 8 }}>
                <RequirementMath eligibility={candidate.eligibility} />
              </div>
              {canGrade && candidate.status === "invited" ? (
                <div style={{ marginTop: 8 }}>
                  <ActionForm
                    action={candidateStatusAction}
                    submitLabel="Confirm attendance"
                    variant="quiet"
                    hiddenFields={{
                      gradingEventId: eventId,
                      candidateId: candidate.candidateId,
                      status: "confirmed",
                    }}
                  />
                </div>
              ) : null}
              {/* Instructor discretion is real: a near miss can be invited
                  anyway, and that decision is audit-logged like any other. */}
              {canGrade &&
              (candidate.status === "eligible" || candidate.status === "near_miss") ? (
                <div style={{ marginTop: 8 }}>
                  <ActionForm
                    action={inviteAction}
                    submitLabel={
                      candidate.status === "near_miss" ? "Invite anyway" : "Invite this family"
                    }
                    variant="quiet"
                    hiddenFields={{
                      gradingEventId: eventId,
                      candidateIds: candidate.candidateId,
                    }}
                  />
                </div>
              ) : null}
              {!candidate.familyEmail ? (
                <p className="t-secondary amber" style={{ marginTop: 6 }}>
                  {candidate.familyName} has no email on file — the invitation cannot reach them.
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {canGrade ? (
        <>
          <SectionHead>Run the event</SectionHead>
          <div className="flex flex-col" style={{ gap: 16 }}>
            <ActionForm
              action={reassembleAction}
              submitLabel="Rebuild the list"
              variant="secondary"
              hiddenFields={{ gradingEventId: eventId }}
            >
              <p className="t-secondary">
                Re-measures every enrollment against today&rsquo;s check-ins. Anyone already invited
                keeps their place.
              </p>
            </ActionForm>

            {/* This form stays mounted even with nobody left to invite. It used
                to be rendered conditionally, and the condition it changed was its
                own: tapping "Invite 1 family" made `eligible.length` zero, which
                unmounted the form — taking its confirmation message with it. The
                desk tapped a button, the button vanished, and nothing said the
                invitations had gone. */}
            <ActionForm
              action={inviteAction}
              submitLabel={
                eligible.length > 0
                  ? `Invite ${eligible.length} famil${eligible.length === 1 ? "y" : "ies"}`
                  : "Invite the eligible families"
              }
              variant="secondary"
              hiddenFields={{ gradingEventId: eventId }}
              disabled={eligible.length === 0}
              disabledReason="Everybody eligible has been invited. A near miss can still be invited one at a time from its row — that call is yours."
            >
              {eligible.length > 0 ? (
                <p className="t-secondary">
                  Emails the household — never the child — with the requirement figures that got them
                  here.
                </p>
              ) : null}
            </ActionForm>

            <div>
              <button
                type="button"
                className="btn btn-primary btn-full"
                onClick={() => setReviewing(!reviewing)}
                aria-expanded={reviewing}
                disabled={previews.length === 0}
              >
                {previews.length === 0
                  ? "Nobody to promote yet"
                  : `${previews.length} promotion${previews.length === 1 ? "" : "s"} — review before recording`}
              </button>
            </div>
          </div>

          {reviewing && previews.length > 0 ? (
            <div className="sheet sheet-enter" style={{ padding: 20, marginTop: 16 }}>
              <p className="t-h2">
                {previews.length} promotion{previews.length === 1 ? "" : "s"} — review before
                recording
              </p>
              <p className="t-secondary" style={{ marginTop: 8 }}>
                Every one of these is permanent, stamped with this event and your name. Change
                anybody to held back or no show before you record.
              </p>
              <div style={{ marginTop: 20 }}>
                <ActionForm
                  action={completeEventAction}
                  submitLabel="Record the event"
                  pendingLabel="Recording…"
                  hiddenFields={{ gradingEventId: eventId }}
                >
                  {previews.map((preview, index) => (
                    <div
                      key={preview.candidateId}
                      className="hairline-b"
                      style={{ paddingBottom: 16, marginBottom: 16 }}
                    >
                      <p className="t-title">{preview.studentName}</p>
                      <div style={{ marginTop: 8 }}>
                        <BeltTransition
                          from={preview.from}
                          to={preview.to}
                          animate
                          seatIndex={index}
                        />
                      </div>
                      <div className="chip-row" style={{ marginTop: 12 }}>
                        {(
                          [
                            ["promote", "Promote"],
                            ["hold_back", "Hold back"],
                            ["no_show", "No show"],
                          ] as const
                        ).map(([value, label]) => (
                          <label key={value} className="chip">
                            <input
                              type="radio"
                              name={`decision:${preview.candidateId}`}
                              value={value}
                              defaultChecked={value === "promote"}
                              style={{ accentColor: "var(--accent)" }}
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </ActionForm>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <p className="t-secondary fg-3" style={{ marginTop: 32 }}>
          Front-desk accounts can see the list and confirm attendance; recording promotions needs an
          instructor or the owner.
        </p>
      )}
    </>
  );
}
