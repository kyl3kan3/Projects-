"use client";

/**
 * The composer. Audience chips, subject, body, channel toggles with a live
 * recipient count computed from data passed in from the server — no client
 * fetching, and no module here reaches the database.
 *
 * Send is a hold-to-confirm: 600ms before a message to 94 families leaves.
 */

import { useState } from "react";
import { ActionForm, type FormState } from "@/components/ActionForm";
import { IconMegaphone } from "@/components/icons";

type Action = (prev: FormState, form: FormData) => Promise<FormState>;

export interface AudienceCounts {
  club: { total: number; sms: number };
  divisions: { id: string; name: string; total: number; sms: number }[];
  teams: { id: string; name: string; divisionName: string; total: number; sms: number }[];
}

export function ComposeForm({
  action,
  counts,
  coachOnly,
}: {
  action: Action;
  counts: AudienceCounts;
  coachOnly: boolean;
}) {
  const [kind, setKind] = useState<"club" | "division" | "team">(coachOnly ? "team" : "club");
  const [divisionIds, setDivisionIds] = useState<string[]>([]);
  const [teamIds, setTeamIds] = useState<string[]>(coachOnly ? counts.teams.map((t) => t.id) : []);
  const [email, setEmail] = useState(true);
  const [sms, setSms] = useState(false);

  const selected =
    kind === "club"
      ? counts.club
      : kind === "division"
        ? counts.divisions
            .filter((d) => divisionIds.includes(d.id))
            .reduce((acc, d) => ({ total: acc.total + d.total, sms: acc.sms + d.sms }), {
              total: 0,
              sms: 0,
            })
        : counts.teams
            .filter((t) => teamIds.includes(t.id))
            .reduce((acc, t) => ({ total: acc.total + t.total, sms: acc.sms + t.sms }), {
              total: 0,
              sms: 0,
            });

  // Households in more than one selected group are counted once by the server;
  // this preview says so rather than pretending the arithmetic is exact.
  const overlapping =
    (kind === "division" && divisionIds.length > 1) || (kind === "team" && teamIds.length > 1);

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  return (
    <ActionForm action={action} submitLabel="Send it" pendingLabel="Sending…" full confirmHold>
      <input type="hidden" name="audienceKind" value={kind} />
      {divisionIds.map((id) => (
        <input key={id} type="hidden" name="divisionIds" value={id} />
      ))}
      {teamIds.map((id) => (
        <input key={id} type="hidden" name="teamIds" value={id} />
      ))}

      <div className="field">
        <span className="t-label">Who gets it</span>
        <div className="chip-row">
          {!coachOnly ? (
            <button
              type="button"
              className="chip"
              data-active={kind === "club"}
              onClick={() => setKind("club")}
            >
              Club · {counts.club.total}
            </button>
          ) : null}
          {!coachOnly ? (
            <button
              type="button"
              className="chip"
              data-active={kind === "division"}
              onClick={() => setKind("division")}
            >
              Divisions
            </button>
          ) : null}
          <button
            type="button"
            className="chip"
            data-active={kind === "team"}
            onClick={() => setKind("team")}
          >
            Teams
          </button>
        </div>
      </div>

      {kind === "division" ? (
        <div className="chip-row">
          {counts.divisions.map((d) => (
            <button
              key={d.id}
              type="button"
              className="chip"
              data-active={divisionIds.includes(d.id)}
              onClick={() => setDivisionIds((l) => toggle(l, d.id))}
            >
              {d.name} · {d.total}
            </button>
          ))}
        </div>
      ) : null}

      {kind === "team" ? (
        <div className="chip-row">
          {counts.teams.map((t) => (
            <button
              key={t.id}
              type="button"
              className="chip"
              data-active={teamIds.includes(t.id)}
              onClick={() => setTeamIds((l) => toggle(l, t.id))}
            >
              {t.name} · {t.total}
            </button>
          ))}
        </div>
      ) : null}

      <div className="field">
        <label className="t-label" htmlFor="subject">
          Subject
        </label>
        <input
          id="subject"
          name="subject"
          className="input"
          placeholder="Saturday's games move to Riverside"
          required
        />
      </div>
      <div className="field">
        <label className="t-label" htmlFor="body">
          Message
        </label>
        <textarea
          id="body"
          name="body"
          className="input"
          rows={7}
          placeholder={
            "Miller Park is closed for aeration this weekend, so every U10 game moves to Riverside Complex at the same times.\n\nFields are numbered from the car park end. Bring both jerseys."
          }
          required
        />
      </div>

      <div className="field">
        <span className="t-label">Channels</span>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            name="email"
            className="check"
            checked={email}
            onChange={(e) => setEmail(e.currentTarget.checked)}
          />
          <span className="t-body">Email — {selected.total} recipient{selected.total === 1 ? "" : "s"}</span>
        </label>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            name="sms"
            className="check"
            checked={sms}
            onChange={(e) => setSms(e.currentTarget.checked)}
          />
          <span className="t-body">
            Text — {selected.sms} consented
            {selected.total - selected.sms > 0
              ? ` (${selected.total - selected.sms} have not opted in)`
              : ""}
          </span>
        </label>
      </div>

      <p className="t-secondary flex items-center gap-2">
        <IconMegaphone size={16} />
        {selected.total === 0
          ? "Nobody is in that audience yet."
          : `${email ? `${selected.total} email` : ""}${email && sms ? " · " : ""}${
              sms ? `${selected.sms} SMS` : ""
            }${!email && !sms ? "Pick a channel" : ""}`}
        {overlapping ? " · families in more than one group are messaged once" : ""}
      </p>
    </ActionForm>
  );
}
