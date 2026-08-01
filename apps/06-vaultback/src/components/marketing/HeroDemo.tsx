"use client";

/**
 * The hero demo: the machine visibly running inside five seconds.
 *
 * It walks a real backup's five stages on a loop and ends by locking a checksum
 * in — the product's signature detail, doing the job the marketing page needs it
 * to do. The data is a staged demo and says so on screen; nothing here is dressed
 * up as a customer's numbers (MARKETING_PLAYBOOK law 5).
 *
 * Two of the page's four animated moments live here. Reduced motion collapses it
 * to the finished state, which is the more persuasive frame anyway.
 */

import { useEffect, useState } from "react";
import { Pipeline } from "@/components/Pipeline";
import { ChecksumLock } from "@/components/Checksum";
import { IconShieldCheck } from "@/components/icons";
import type { Stage } from "@/db/schema";

const SEQUENCE: Stage[] = ["dump", "compress", "encrypt", "upload", "verify"];
const CHECKSUM = "9f3c8a1d5b7e2c46f0a9d31b8e6c5f47a213c9d0b4e8f6a5c7d9e1b3a5c7f41d";

export function HeroDemo() {
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setIndex(SEQUENCE.length - 1);
      setDone(true);
      return;
    }
    let step = 0;
    const timer = setInterval(() => {
      step++;
      if (step >= SEQUENCE.length) {
        clearInterval(timer);
        setIndex(SEQUENCE.length - 1);
        setDone(true);
        return;
      }
      setIndex(step);
    }, 900);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="t-label">Staged demo · our own development database</span>
        <span className="pill" data-state={done ? "verified" : "running"}>
          {done ? "Verified" : "Running"}
        </span>
      </div>

      <p className="t-title mt-3">prod-supabase</p>
      <p className="t-data mt-1.5" style={{ color: "var(--color-text-3)" }}>
        2026-07-03 04:00 UTC · 1.2 GB · 41 tables
      </p>

      <Pipeline stage={SEQUENCE[index]} state={done ? "done" : "running"} />

      <div className="hairline-t mt-3 pt-3">
        {done ? (
          <ChecksumLock sha256={CHECKSUM} verified animate />
        ) : (
          <span className="t-data" style={{ color: "var(--color-text-3)" }}>
            checksum pending
          </span>
        )}
      </div>

      {done ? (
        <p className="t-secondary mt-3 flex items-start gap-2" style={{ color: "var(--color-seal)" }}>
          <IconShieldCheck size={16} />
          Restored into a scratch database and verified: 214,882 rows across 41 tables, all counts
          matched.
        </p>
      ) : (
        <p className="t-secondary mt-3">Streaming straight to storage. Nothing touches a disk.</p>
      )}
    </div>
  );
}
