"use client";

/**
 * The retrieval demo, in one field: type a name, get the record. Results replace
 * the list via crossfade; the coverage answer arrives with the row.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { IconLink, IconSearch } from "@/components/icons";
import { CoveragePill } from "@/components/CoveragePill";
import type { Coverage } from "@/lib/coverage";

interface Result {
  participantId: string;
  displayName: string;
  isMinor: boolean;
  guardianName: string | null;
  coverage: Coverage;
  lastSignedAt: string | null;
  email: string | null;
  phone: string | null;
}

export function ParticipantSearch({ timeZone }: { timeZone: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  const requestId = useRef(0);

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
      setMs(typeof data.ms === "number" ? data.ms : null);
    }, 120);
    return () => clearTimeout(timer);
  }, [query]);

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div>
      <div className="search-field">
        <IconSearch size={20} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Maya Torres, 303 555…, dana@"
          aria-label="Search participants"
          autoComplete="off"
        />
      </div>

      {results !== null ? (
        <>
          <p className="t-secondary mt-2">
            {results.length} {results.length === 1 ? "match" : "matches"}
            {ms !== null ? ` · ${ms}ms` : ""}
          </p>
          <div className="crossfade mt-3" key={query}>
            {results.length === 0 ? (
              <p className="t-secondary py-6">
                Nothing matches “{query}”. Partial names work — two characters is enough.
              </p>
            ) : (
              results.map((r) => (
                <Link
                  key={r.participantId}
                  href={`/participants/${r.participantId}`}
                  className="row no-underline"
                >
                  <span className="min-w-0 flex-1">
                    <span className="t-title flex items-center gap-1.5">
                      {r.displayName}
                      {r.isMinor ? (
                        <IconLink size={14} style={{ color: "var(--color-text-3)" }} />
                      ) : null}
                    </span>
                    <span className="t-secondary block truncate">
                      {r.isMinor && r.guardianName ? `guardian: ${r.guardianName} · ` : ""}
                      {r.lastSignedAt
                        ? `last signed ${fmt.format(new Date(r.lastSignedAt)).toUpperCase()}`
                        : "no waiver on file"}
                    </span>
                  </span>
                  <CoveragePill coverage={r.coverage} />
                </Link>
              ))
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
