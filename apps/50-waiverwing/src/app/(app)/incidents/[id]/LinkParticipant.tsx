"use client";

/**
 * Linking someone to an incident uses the same search as the counter — one search
 * field in the product, one set of results, one coverage answer.
 */

import { useActionState, useEffect, useRef, useState } from "react";
import { IconSearch } from "@/components/icons";
import { CoveragePill } from "@/components/CoveragePill";
import type { Coverage } from "@/lib/coverage";
import { linkParticipantAction, type IncidentFormState } from "../actions";

interface Result {
  participantId: string;
  displayName: string;
  isMinor: boolean;
  guardianName: string | null;
  coverage: Coverage;
}

export function LinkParticipant({ incidentId }: { incidentId: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [picked, setPicked] = useState<Result | null>(null);
  const requestId = useRef(0);
  const [state, action, pending] = useActionState<IncidentFormState, FormData>(
    linkParticipantAction,
    {},
  );

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (id !== requestId.current) return;
      setResults(data.results ?? []);
    }, 120);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (state.ok) {
      setPicked(null);
      setQuery("");
      setResults(null);
    }
  }, [state.ok]);

  return (
    <div>
      <div className="search-field">
        <IconSearch size={20} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the participant database"
          aria-label="Search participants to link"
          autoComplete="off"
        />
      </div>

      {results !== null && !picked ? (
        <div className="crossfade mt-3" key={query}>
          {results.length === 0 ? (
            <p className="t-secondary py-4">
              Nobody matches “{query}”. Someone who never signed will not be here — note them in
              the description instead.
            </p>
          ) : (
            results.map((r) => (
              <button
                key={r.participantId}
                type="button"
                className="row"
                onClick={() => setPicked(r)}
              >
                <span className="min-w-0 flex-1">
                  <span className="t-title">{r.displayName}</span>
                  <span className="t-secondary block truncate">
                    {r.isMinor && r.guardianName ? `guardian: ${r.guardianName}` : "Adult"}
                  </span>
                </span>
                <CoveragePill coverage={r.coverage} />
              </button>
            ))
          )}
        </div>
      ) : null}

      {picked ? (
        <form action={action} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="incidentId" value={incidentId} />
          <input type="hidden" name="participantId" value={picked.participantId} />
          <p className="t-title">{picked.displayName}</p>
          <label className="flex flex-col gap-2">
            <span className="t-label">Their part in it</span>
            <textarea
              name="note"
              className="input"
              rows={3}
              placeholder="Fell from the third clip; walked off unaided; ice applied at the desk."
            />
          </label>
          <div className="flex gap-3">
            <button className="btn btn-primary flex-1" type="submit" disabled={pending}>
              {pending ? "Linking…" : "Link to this incident"}
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setPicked(null)}
              disabled={pending}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {state.error ? (
        <p className="t-secondary mt-3" style={{ color: "var(--color-ember)" }} role="alert">
          {state.error}
        </p>
      ) : state.ok ? (
        <p className="t-secondary mt-3" style={{ color: "var(--color-pine)" }} role="status">
          {state.ok}
        </p>
      ) : null}
    </div>
  );
}
