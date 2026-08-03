"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { BeltBar } from "@/components/belt-bar";
import { IconSignoffPen } from "@/components/icons";
import { SectionHead } from "@/components/ui";
import { BELT_PRESETS } from "@/lib/curricula";
import { addRankAction, archiveProgramAction, createProgramAction, updateRankAction } from "./actions";

export interface RankRow {
  id: string;
  name: string;
  displayOrder: number;
  beltColorHex: string;
  stripes: number;
  minClasses: number;
  minDaysInRank: number;
  requiresSignoff: boolean;
  holders: number;
}

export interface ProgramRow {
  id: string;
  name: string;
  description: string;
  ranks: RankRow[];
}

export function CurriculumEditor({
  programs,
  canEdit,
}: {
  programs: ProgramRow[];
  canEdit: boolean;
}) {
  const [openRank, setOpenRank] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <>
      {programs.map((program) => (
        <section key={program.id}>
          <SectionHead
            right={
              canEdit ? (
                <button
                  type="button"
                  className="btn-quiet"
                  onClick={() => setAddingTo(addingTo === program.id ? null : program.id)}
                >
                  Add a rank
                </button>
              ) : undefined
            }
          >
            {program.name}
          </SectionHead>
          {program.description ? (
            <p className="t-secondary" style={{ marginBottom: 12 }}>
              {program.description}
            </p>
          ) : null}

          {program.ranks.length === 0 ? (
            <p className="t-secondary fg-3">
              No ranks yet — add the beginner belt first; order follows the order you add them in.
            </p>
          ) : (
            <div>
              {program.ranks.map((rank) => (
                <div key={rank.id} className="row-block">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="t-title">
                      <span className="t-data fg-3">{rank.displayOrder + 1}</span> {rank.name}
                    </p>
                    <span className="flex items-center gap-2" style={{ flex: "none" }}>
                      {rank.requiresSignoff ? (
                        <span className="fg-3" aria-label="Requires instructor sign-off">
                          <IconSignoffPen size={18} />
                        </span>
                      ) : null}
                      <span className="t-data fg-3">
                        {rank.holders} at rank
                      </span>
                    </span>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <BeltBar
                      beltColorHex={rank.beltColorHex}
                      rankName={rank.name}
                      stripesEarned={rank.stripes}
                      stripesTotal={rank.stripes}
                      classesDone={0}
                      classesRequired={0}
                      showProgress={false}
                    />
                  </div>
                  <p className="t-data fg-2" style={{ marginTop: 8 }}>
                    {rank.minClasses} classes · {rank.minDaysInRank} days
                    {rank.stripes > 0
                      ? ` · ${rank.stripes} stripes → ${Math.ceil(rank.minClasses / (rank.stripes + 1))} classes / ${Math.ceil(rank.minDaysInRank / (rank.stripes + 1))} days per step`
                      : " in one step"}
                  </p>
                  {canEdit ? (
                    <button
                      type="button"
                      className="btn-quiet"
                      style={{ marginTop: 8 }}
                      onClick={() => setOpenRank(openRank === rank.id ? null : rank.id)}
                      aria-expanded={openRank === rank.id}
                    >
                      {openRank === rank.id ? "Close" : "Adjust requirements"}
                    </button>
                  ) : null}

                  {openRank === rank.id ? (
                    <div className="card sheet-enter" style={{ padding: 16, marginTop: 12 }}>
                      <ActionForm
                        action={updateRankAction}
                        submitLabel="Save"
                        variant="secondary"
                        hiddenFields={{ rankId: rank.id }}
                      >
                        <div className="split-even">
                          <div className="field">
                            <label className="t-label" htmlFor={`mc-${rank.id}`}>
                              Min classes (whole rank)
                            </label>
                            <input
                              id={`mc-${rank.id}`}
                              name="minClasses"
                              type="number"
                              min={0}
                              className="input input-mono"
                              defaultValue={rank.minClasses}
                            />
                          </div>
                          <div className="field">
                            <label className="t-label" htmlFor={`md-${rank.id}`}>
                              Min days in rank
                            </label>
                            <input
                              id={`md-${rank.id}`}
                              name="minDaysInRank"
                              type="number"
                              min={0}
                              className="input input-mono"
                              defaultValue={rank.minDaysInRank}
                            />
                          </div>
                          <div className="field">
                            <label className="t-label" htmlFor={`st-${rank.id}`}>
                              Stripes
                            </label>
                            <input
                              id={`st-${rank.id}`}
                              name="stripes"
                              type="number"
                              min={0}
                              max={10}
                              className="input input-mono"
                              defaultValue={rank.stripes}
                            />
                          </div>
                          <div className="field">
                            <label className="t-label" htmlFor={`bc-${rank.id}`}>
                              Belt colour
                            </label>
                            <input
                              id={`bc-${rank.id}`}
                              name="beltColorHex"
                              className="input input-mono"
                              defaultValue={rank.beltColorHex}
                            />
                          </div>
                        </div>
                        <label className="flex items-center gap-3" style={{ marginTop: 4 }}>
                          <input
                            type="checkbox"
                            name="requiresSignoff"
                            className="check"
                            defaultChecked={rank.requiresSignoff}
                          />
                          <span className="t-body">Requires an instructor sign-off</span>
                        </label>
                      </ActionForm>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          {addingTo === program.id ? (
            <div className="card sheet-enter" style={{ padding: 16, marginTop: 16 }}>
              <p className="t-title">Add a rank to {program.name}</p>
              <p className="t-secondary" style={{ marginTop: 4 }}>
                It goes on the top of the ladder — ranks are added from beginner upward.
              </p>
              <div style={{ marginTop: 12 }}>
                <ActionForm
                  action={addRankAction}
                  submitLabel="Add rank"
                  hiddenFields={{ programId: program.id }}
                >
                  <div className="field">
                    <label className="t-label" htmlFor={`nn-${program.id}`}>
                      Name
                    </label>
                    <input
                      id={`nn-${program.id}`}
                      name="name"
                      className="input"
                      required
                      placeholder="Purple belt"
                    />
                  </div>
                  <div className="split-even">
                    <div className="field">
                      <label className="t-label" htmlFor={`nc-${program.id}`}>
                        Min classes
                      </label>
                      <input
                        id={`nc-${program.id}`}
                        name="minClasses"
                        type="number"
                        min={0}
                        className="input input-mono"
                        defaultValue={100}
                      />
                    </div>
                    <div className="field">
                      <label className="t-label" htmlFor={`nd-${program.id}`}>
                        Min days
                      </label>
                      <input
                        id={`nd-${program.id}`}
                        name="minDaysInRank"
                        type="number"
                        min={0}
                        className="input input-mono"
                        defaultValue={540}
                      />
                    </div>
                    <div className="field">
                      <label className="t-label" htmlFor={`ns-${program.id}`}>
                        Stripes
                      </label>
                      <input
                        id={`ns-${program.id}`}
                        name="stripes"
                        type="number"
                        min={0}
                        max={10}
                        className="input input-mono"
                        defaultValue={4}
                      />
                    </div>
                    <div className="field">
                      <label className="t-label" htmlFor={`nb-${program.id}`}>
                        Belt colour
                      </label>
                      <input
                        id={`nb-${program.id}`}
                        name="beltColorHex"
                        className="input input-mono"
                        defaultValue={BELT_PRESETS.purple}
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-3">
                    <input type="checkbox" name="requiresSignoff" className="check" defaultChecked />
                    <span className="t-body">Requires an instructor sign-off</span>
                  </label>
                </ActionForm>
              </div>
            </div>
          ) : null}

          {canEdit && program.ranks.length > 0 ? (
            <div style={{ marginTop: 16 }}>
              <ActionForm
                action={archiveProgramAction}
                submitLabel={`Archive ${program.name}`}
                variant="danger"
                small
                confirmHold
                hiddenFields={{ programId: program.id }}
              />
            </div>
          ) : null}
        </section>
      ))}

      {canEdit ? (
        <>
          <SectionHead>Another program</SectionHead>
          {creating ? (
            <div className="card sheet-enter" style={{ padding: 16 }}>
              <ActionForm action={createProgramAction} submitLabel="Create program">
                <div className="field">
                  <label className="t-label" htmlFor="pname">
                    Name
                  </label>
                  <input
                    id="pname"
                    name="name"
                    className="input"
                    required
                    placeholder="No-Gi Advanced"
                  />
                </div>
                <div className="field">
                  <label className="t-label" htmlFor="pdesc">
                    Description
                  </label>
                  <input
                    id="pdesc"
                    name="description"
                    className="input"
                    placeholder="Tuesday and Saturday, blue belt and above"
                  />
                </div>
              </ActionForm>
            </div>
          ) : (
            <button type="button" className="btn btn-secondary" onClick={() => setCreating(true)}>
              Create a program
            </button>
          )}
        </>
      ) : null}
    </>
  );
}
