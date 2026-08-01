"use client";

/**
 * The staff home screen (DESIGN.md "Check-in").
 *
 * Search is the hero: typing replaces today's board with results via a 120ms
 * crossfade and never bounces the layout. Selecting a row puts the primary
 * action in the thumb zone — **Check in** on a covered row, **Send re-sign link**
 * on an amber one, because those are the only two things staff ever do here.
 */

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { IconChevronRight, IconLink, IconSearch } from "@/components/icons";
import { CoveragePill } from "@/components/CoveragePill";
import { Blaze } from "@/components/Blaze";
import type { Coverage } from "@/lib/coverage";
import { checkInAction, sendResignLinkAction, type CheckinState } from "./actions";

export interface Row {
  participantId: string;
  displayName: string;
  isMinor: boolean;
  guardianName: string | null;
  coverage: Coverage;
  reason: string | null;
  signedAt: string | null;
  checkedInAt: string | null;
  lastSignedAt?: string | null;
  channel?: string | null;
}

function timeLabel(iso: string | null | undefined, timeZone: string): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

function dateLabel(iso: string | null | undefined, timeZone: string): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  })
    .format(new Date(iso))
    .toUpperCase();
}

function ParticipantRow({
  row,
  selected,
  onSelect,
  timeZone,
  justCheckedIn,
}: {
  row: Row;
  selected: boolean;
  onSelect: () => void;
  timeZone: string;
  justCheckedIn: boolean;
}) {
  const secondary: string[] = [];
  if (row.checkedInAt) secondary.push(`Checked in ${timeLabel(row.checkedInAt, timeZone)}`);
  else if (row.signedAt) secondary.push(`Signed ${timeLabel(row.signedAt, timeZone)}`);
  else if (row.lastSignedAt) secondary.push(`Last signed ${dateLabel(row.lastSignedAt, timeZone)}`);
  else secondary.push("No waiver yet");
  if (row.channel) secondary.push(row.channel.toUpperCase());

  return (
    <button type="button" className="row" data-selected={selected} onClick={onSelect}>
      {row.checkedInAt ? <span className="checked-dot" data-pop={justCheckedIn} /> : null}
      <span className="min-w-0 flex-1">
        <span className="t-title flex items-center gap-1.5">
          {row.displayName}
          {row.isMinor ? <IconLink size={14} style={{ color: "var(--color-text-3)" }} /> : null}
        </span>
        <span className="t-secondary block truncate">
          {row.isMinor && row.guardianName
            ? `guardian: ${row.guardianName} · ${secondary.join(" · ")}`
            : secondary.join(" · ")}
        </span>
      </span>
      <CoveragePill coverage={row.coverage} />
    </button>
  );
}

export function CheckinBoard({
  boardRows,
  timeZone,
  dayStat,
  locationName,
  qrToken,
  canCheckIn,
}: {
  boardRows: Row[];
  timeZone: string;
  dayStat: string;
  locationName: string;
  qrToken: string;
  canCheckIn: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Row[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchMs, setSearchMs] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [poppedId, setPoppedId] = useState<string | null>(null);
  const requestId = useRef(0);

  const [checkinState, checkInSubmit, checkinPending] = useActionState<CheckinState, FormData>(
    checkInAction,
    {},
  );
  const [resignState, resignSubmit, resignPending] = useActionState<CheckinState, FormData>(
    sendResignLinkAction,
    {},
  );

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setSearchMs(null);
      return;
    }
    const id = ++requestId.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (id !== requestId.current) return;
        setResults(data.results ?? []);
        setSearchMs(typeof data.ms === "number" ? data.ms : null);
      } finally {
        if (id === requestId.current) setSearching(false);
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (checkinState.ok && checkinState.participantId) {
      setPoppedId(checkinState.participantId);
    }
  }, [checkinState]);

  const rows = results ?? boardRows;
  const selectedRow = useMemo(
    () => rows.find((r) => r.participantId === selected) ?? null,
    [rows, selected],
  );
  const covered =
    selectedRow?.coverage === "on_file" || selectedRow?.coverage === "visitor";

  const message = checkinState.error ?? resignState.error ?? checkinState.ok ?? resignState.ok;
  const messageIsError = Boolean(checkinState.error ?? resignState.error);

  return (
    <div className="px-5 lg:px-0">
      <div className="flex items-start justify-between gap-4 pt-6">
        <div className="min-w-0">
          <h1 className="t-h2 truncate">{locationName}</h1>
          <p className="t-data mt-1.5" style={{ color: "var(--color-text-2)" }}>
            {dayStat}
          </p>
        </div>
        <Link href="/settings/poster" className="btn btn-secondary shrink-0">
          QR poster
        </Link>
      </div>

      <div className="search-field mt-5">
        <IconSearch size={20} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search every participant by name, email or phone"
          aria-label="Search participants"
          enterKeyHint="search"
          autoComplete="off"
        />
      </div>

      {results !== null ? (
        <p className="t-secondary mt-2">
          {searching
            ? "Searching…"
            : `${results.length} ${results.length === 1 ? "match" : "matches"} across the whole database${
                searchMs !== null ? ` · ${searchMs}ms` : ""
              }`}
        </p>
      ) : (
        <p className="t-label mt-5">Today at this location</p>
      )}

      <div className={results !== null ? "crossfade mt-3" : "mt-3"} key={results === null ? "board" : query}>
        {rows.length === 0 ? (
          results !== null ? (
            <div className="py-10">
              <p className="t-body">Nobody found for “{query}”.</p>
              <p className="t-secondary mt-2">
                Search matches partial names, emails and phone numbers. If they have never
                signed here, hand them the QR poster or start a kiosk session.
              </p>
            </div>
          ) : (
            <div className="py-10">
              <Blaze size={40} draw={false} />
              <p className="t-body mt-4">Nobody has signed here today yet.</p>
              <p className="t-secondary mt-2">
                Print the QR poster for the counter, or open the kiosk on the counter tablet.
                Signings appear here the moment they finish — no refresh needed at the desk.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/settings/poster" className="btn btn-primary">
                  Print the QR poster
                </Link>
                <Link href={`/sign/${qrToken}`} className="btn btn-secondary">
                  Open the sign flow
                </Link>
              </div>
            </div>
          )
        ) : (
          rows.map((row, i) => (
            <div key={row.participantId} className="enter" style={{ animationDelay: `${Math.min(i, 8) * 24}ms` }}>
              <ParticipantRow
                row={row}
                selected={selected === row.participantId}
                onSelect={() =>
                  setSelected(selected === row.participantId ? null : row.participantId)
                }
                timeZone={timeZone}
                justCheckedIn={poppedId === row.participantId}
              />
            </div>
          ))
        )}
      </div>

      {message ? (
        <p
          className="t-secondary mt-4"
          style={{ color: messageIsError ? "var(--color-ember)" : "var(--color-pine)" }}
          role="status"
        >
          {message}
        </p>
      ) : null}

      {selectedRow ? (
        <div className="action-bar">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="t-title truncate">{selectedRow.displayName}</p>
              <p className="t-secondary truncate">
                {selectedRow.reason ?? "Current waiver on file"}
              </p>
            </div>
            <Link
              href={`/participants/${selectedRow.participantId}`}
              className="btn btn-secondary shrink-0"
            >
              Record
              <IconChevronRight size={16} />
            </Link>
          </div>

          {covered ? (
            <form action={checkInSubmit}>
              <input type="hidden" name="participantId" value={selectedRow.participantId} />
              <button
                className="btn btn-primary btn-full"
                type="submit"
                disabled={checkinPending || !canCheckIn}
              >
                {checkinPending ? "Checking in…" : "Check in"}
              </button>
              {!canCheckIn ? (
                <p className="t-secondary mt-2">
                  Check-in is a Front Desk feature.{" "}
                  <Link href="/settings/billing" className="btn-quiet">
                    Compare plans
                  </Link>
                </p>
              ) : null}
            </form>
          ) : (
            <form action={resignSubmit}>
              <input type="hidden" name="participantId" value={selectedRow.participantId} />
              <button className="btn btn-primary btn-full" type="submit" disabled={resignPending}>
                {resignPending ? "Sending…" : "Send re-sign link"}
              </button>
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}
