"use client";

/**
 * The two actions on a leak: "show me the trades" (which expands the evidence,
 * because a finding a trader cannot check is a finding they should not believe)
 * and "watch this pattern", which puts a guardrail chip on the dashboard.
 */

import { useState } from "react";
import Link from "next/link";
import { IconChevronDown, IconEye } from "@/components/icons";
import { toggleWatchAction } from "./actions";

export interface EvidenceRow {
  id: string;
  symbol: string;
  when: string;
  pnlLabel: string;
  sign: number;
}

export function LeakActions({
  findingId,
  watching,
  evidence,
  moreCount,
}: {
  findingId: string;
  watching: boolean;
  evidence: EvidenceRow[];
  moreCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [isWatching, setIsWatching] = useState(watching);

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-5">
        <button
          type="button"
          className="btn-quiet inline-flex items-center gap-1"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? "Hide the trades" : "Show me the trades"}
          <IconChevronDown
            size={16}
            className={open ? "rotate-180 transition-transform" : "transition-transform"}
          />
        </button>

        <button
          type="button"
          className="chip"
          data-active={isWatching}
          aria-pressed={isWatching}
          onClick={() => {
            const next = !isWatching;
            setIsWatching(next);
            void toggleWatchAction(findingId, next);
          }}
        >
          <IconEye size={14} />
          {isWatching ? "Watching" : "Watch this pattern"}
        </button>
      </div>

      {open ? (
        <ul className="mt-4">
          {evidence.map((row) => (
            <li key={row.id}>
              <Link href={`/journal/${row.id}`} className="row">
                <span className="t-cell flex-1">{row.symbol}</span>
                <span className="t-secondary">{row.when}</span>
                <span
                  className={`t-cell ${row.sign > 0 ? "v-profit" : row.sign < 0 ? "v-loss" : ""}`}
                >
                  {row.pnlLabel}
                </span>
              </Link>
            </li>
          ))}
          {moreCount > 0 ? (
            <li className="pt-3">
              <p className="t-secondary">
                and {moreCount} more — worst first, all of them in the journal.
              </p>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
