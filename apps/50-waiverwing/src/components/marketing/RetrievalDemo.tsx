"use client";

/**
 * The hero device: **signed, searchable, on file in seconds.**
 *
 * The product's own demo, staged and labelled as one. Three beats — a name is
 * typed, the record surfaces with its coverage answer, the evidence stamps in —
 * which is the whole lawsuit scenario in about four seconds. It is the marketing
 * page's first animated moment (playbook law 6: four, and this is one).
 *
 * Nothing here is fabricated data dressed as a customer: the venue, the names and
 * the timestamps are the same demo fixtures the seed script installs, and the
 * frame says "staged demo" out loud.
 */

import { useEffect, useState } from "react";
import { Blaze } from "@/components/Blaze";
import { IconLink, IconSearch, IconShieldCheck } from "@/components/icons";

const TARGET = "maya torres";
const STEP_MS = 90;

export function RetrievalDemo() {
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<0 | 1 | 2>(0);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      setTyped(TARGET);
      setPhase(2);
      return;
    }

    let i = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const tick = setInterval(() => {
      i += 1;
      setTyped(TARGET.slice(0, i));
      if (i >= TARGET.length) {
        clearInterval(tick);
        timers.push(setTimeout(() => setPhase(1), 160));
        timers.push(setTimeout(() => setPhase(2), 640));
      }
    }, STEP_MS);

    return () => {
      clearInterval(tick);
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div className="panel overflow-hidden">
      <div className="hairline-b flex items-center justify-between gap-3 px-4 py-3">
        <span className="t-label">Granite Works — Denver</span>
        <span className="t-data" style={{ color: "var(--color-text-3)" }}>
          214 SIGNED · 186 IN
        </span>
      </div>

      <div className="p-4">
        <div className="search-field">
          <IconSearch size={20} />
          <span
            className="flex-1 truncate"
            style={{ fontSize: "18px", color: typed ? "var(--color-text)" : "var(--color-text-3)" }}
          >
            {typed || "Search every participant"}
            <span
              aria-hidden
              style={{
                display: "inline-block",
                width: "2px",
                height: "20px",
                marginLeft: "2px",
                verticalAlign: "-4px",
                background: phase === 0 ? "var(--color-trail)" : "transparent",
              }}
            />
          </span>
        </div>

        {phase >= 1 ? (
          <div className="enter mt-3">
            <div className="row" style={{ cursor: "default" }}>
              <span className="min-w-0 flex-1">
                <span className="t-title flex items-center gap-1.5">
                  Maya Torres
                  <IconLink size={14} style={{ color: "var(--color-text-3)" }} />
                </span>
                <span className="t-secondary block truncate">
                  guardian: Dana Torres · last signed JAN 4 2026
                </span>
              </span>
              <span className="pill" data-coverage="on_file">
                <span className="pill-dot" />
                ON FILE
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-3" style={{ height: "76px" }} />
        )}

        {phase >= 2 ? (
          <div className="enter mt-4">
            <div className="flex items-start gap-2">
              <IconShieldCheck size={18} style={{ color: "var(--color-pine)", flex: "none" }} />
              <div className="min-w-0">
                <p className="t-secondary" style={{ color: "var(--color-text)" }}>
                  Signed by Dana Torres — parent — when Maya was 13.
                </p>
                <p className="t-data mt-1.5" style={{ color: "var(--color-text-2)" }}>
                  SIGNED JAN 4 2026 · 09:41 · KIOSK · SHA-256 4B1E…9C77
                </p>
                <p className="t-data mt-1" style={{ color: "var(--color-text-3)" }}>
                  AUTHORITY ENDS APR 9 2030 (SHE TURNS 18)
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <span className="btn btn-primary" aria-hidden style={{ pointerEvents: "none" }}>
                Export PDF
              </span>
              <Blaze size={22} draw={false} />
            </div>
          </div>
        ) : (
          <div className="mt-4" style={{ height: "140px" }} />
        )}
      </div>

      <div className="hairline-t px-4 py-2.5">
        <span className="t-label">Staged demo · our own seed data</span>
      </div>
    </div>
  );
}
