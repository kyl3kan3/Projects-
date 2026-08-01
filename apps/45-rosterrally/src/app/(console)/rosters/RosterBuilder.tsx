"use client";

/**
 * The roster builder.
 *
 * Drag from the pool onto a team, with a 2px turf insertion hairline at the drop
 * point (DESIGN.md). Every drag has a visible button equivalent that does the same
 * thing — a "Place on" control on each pool row, up/down on each rostered row —
 * because a gesture must never be the only path, for motor accessibility as much
 * as for reduced motion.
 *
 * Server actions are imported and called directly rather than through form
 * submission, so the optimistic state and the violation messages live in one
 * place. A violation ("Thunder is at its 14-player limit") is rendered verbatim.
 */

import { useState, useTransition } from "react";
import type { FormState } from "@/components/ActionForm";
import {
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconLock,
  IconMinus,
  IconPlus,
} from "@/components/icons";
import { formatMoney } from "@/lib/money";
import { stateLabel, type PaymentState } from "@/lib/ledger";

export interface BuilderPlayer {
  playerId: string;
  firstName: string;
  lastName: string;
  state: PaymentState;
  balanceCents: number;
}

export interface BuilderTeam {
  teamId: string;
  name: string;
  capacity: number;
  locked: boolean;
  coachNames: string[];
  entries: { playerId: string; firstName: string; lastName: string; jerseyNumber: string | null }[];
}

type Action = (prev: FormState, form: FormData) => Promise<FormState>;

export function RosterBuilder({
  divisionName,
  teams,
  pool,
  assignAction,
  removeAction,
  jerseyAction,
  moveAction,
}: {
  divisionName: string;
  teams: BuilderTeam[];
  pool: BuilderPlayer[];
  assignAction: Action;
  removeAction: Action;
  jerseyAction: Action;
  moveAction: Action;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ error?: string; ok?: string }>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const [overTeam, setOverTeam] = useState<string | null>(null);

  const run = (action: Action, fields: Record<string, string>) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    startTransition(async () => {
      const result = await action({}, form);
      setMessage(result);
    });
  };

  const unassigned = pool.filter((p) => !teams.some((t) => t.entries.some((e) => e.playerId === p.playerId)));

  return (
    <div className="build-grid">
      <div>
        {message.error ? (
          <p className="t-secondary mb-3" style={{ color: "var(--bad)" }} role="alert">
            {message.error}
          </p>
        ) : null}
        {message.ok ? (
          <p className="t-secondary mb-3 turf" role="status">
            {message.ok}
          </p>
        ) : null}

        {teams.length === 0 ? (
          <p className="t-secondary py-2">
            No teams in {divisionName} yet. Add one below, then place players onto it.
          </p>
        ) : null}

        {teams.map((team) => (
          <section
            key={team.teamId}
            className="panel mt-4 p-4"
            style={{
              outline: overTeam === team.teamId ? "2px solid var(--accent)" : "none",
              outlineOffset: 2,
            }}
            onDragOver={(e) => {
              if (!dragging || team.locked) return;
              e.preventDefault();
              setOverTeam(team.teamId);
            }}
            onDragLeave={() => setOverTeam((t) => (t === team.teamId ? null : t))}
            onDrop={(e) => {
              e.preventDefault();
              setOverTeam(null);
              if (!dragging || team.locked) return;
              run(assignAction, { teamId: team.teamId, playerId: dragging });
              setDragging(null);
            }}
          >
            <header className="flex items-baseline justify-between gap-3">
              <div>
                <h3 className="t-title">{team.name}</h3>
                <p className="t-data mt-1" style={{ color: "var(--fg-2)" }}>
                  {team.entries.length} / {team.capacity}
                  {team.coachNames.length > 0 ? ` · ${team.coachNames.join(", ")}` : " · no coach"}
                </p>
              </div>
              {team.locked ? (
                <span className="pill pill-warn">
                  <IconLock size={12} />
                  LOCKED
                </span>
              ) : null}
            </header>

            {team.entries.length === 0 ? (
              <p className="t-secondary mt-3" style={{ color: "var(--fg-3)" }}>
                Empty. Drag a player here, or use Place on {team.name}.
              </p>
            ) : (
              <div className="mt-3">
                {team.entries.map((entry, index) => (
                  <div
                    key={entry.playerId}
                    className="row"
                    style={{
                      borderTop:
                        overTeam === team.teamId && index === 0
                          ? "2px solid var(--accent)"
                          : undefined,
                    }}
                  >
                    <input
                      className="jersey-input"
                      defaultValue={entry.jerseyNumber ?? ""}
                      inputMode="numeric"
                      aria-label={`Jersey number for ${entry.firstName} ${entry.lastName}`}
                      disabled={team.locked || pending}
                      onBlur={(e) => {
                        const value = e.currentTarget.value.trim();
                        if (value === (entry.jerseyNumber ?? "")) return;
                        run(jerseyAction, {
                          teamId: team.teamId,
                          playerId: entry.playerId,
                          jersey: value,
                        });
                      }}
                    />
                    <span className="t-title min-w-0 flex-1 truncate">
                      {entry.firstName} {entry.lastName}
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      aria-label={`Move ${entry.firstName} up`}
                      disabled={team.locked || pending || index === 0}
                      onClick={() =>
                        run(moveAction, {
                          teamId: team.teamId,
                          playerId: entry.playerId,
                          direction: "up",
                        })
                      }
                    >
                      <IconArrowUp size={16} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      aria-label={`Move ${entry.firstName} down`}
                      disabled={team.locked || pending || index === team.entries.length - 1}
                      onClick={() =>
                        run(moveAction, {
                          teamId: team.teamId,
                          playerId: entry.playerId,
                          direction: "down",
                        })
                      }
                    >
                      <IconArrowDown size={16} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      aria-label={`Take ${entry.firstName} off ${team.name}`}
                      disabled={team.locked || pending}
                      onClick={() =>
                        run(removeAction, { teamId: team.teamId, playerId: entry.playerId })
                      }
                    >
                      <IconMinus size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>

      <aside className="mt-8 lg:mt-4">
        <p className="t-label">Pool · {unassigned.length} not placed</p>
        {unassigned.length === 0 ? (
          <p className="t-secondary mt-2 turf">
            <IconCheck size={14} /> Every registered player in {divisionName} has a team.
          </p>
        ) : (
          <div className="stagger mt-1">
            {unassigned.map((player) => (
              <div
                key={player.playerId}
                className="row"
                draggable
                onDragStart={() => setDragging(player.playerId)}
                onDragEnd={() => {
                  setDragging(null);
                  setOverTeam(null);
                }}
                style={{ cursor: "grab", opacity: dragging === player.playerId ? 0.5 : 1 }}
              >
                <span className="min-w-0 flex-1">
                  <span className="t-title block truncate">
                    {player.firstName} {player.lastName}
                  </span>
                  <span
                    className="t-data block"
                    style={{
                      color: player.state === "paid" ? "var(--accent)" : "var(--warn)",
                    }}
                  >
                    {stateLabel(player.state)}
                    {player.balanceCents > 0 ? ` · ${formatMoney(player.balanceCents)} owing` : ""}
                  </span>
                </span>
                <select
                  className="input btn-small"
                  style={{ width: 148, height: 36, fontSize: 13 }}
                  aria-label={`Place ${player.firstName} on a team`}
                  defaultValue=""
                  disabled={pending || teams.length === 0}
                  onChange={(e) => {
                    const teamId = e.currentTarget.value;
                    if (!teamId) return;
                    e.currentTarget.value = "";
                    run(assignAction, { teamId, playerId: player.playerId });
                  }}
                >
                  <option value="">Place on…</option>
                  {teams
                    .filter((t) => !t.locked)
                    .map((t) => (
                      <option key={t.teamId} value={t.teamId}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </div>
            ))}
          </div>
        )}
        <p className="t-secondary mt-3" style={{ color: "var(--fg-3)" }}>
          <IconPlus size={14} /> A player can only be on one team per division, and nothing can be
          placed before some money has arrived or a plan is running.
        </p>
      </aside>
    </div>
  );
}
