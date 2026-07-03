"use client";

/**
 * Beat 1 of the four-beat motion budget (MARKETING_PLAYBOOK.md):
 * the machine visibly running. A staged, honestly-labeled loop — our own
 * 62-minute episode becoming its 14-asset kit. Pure DOM/Framer, 60fps on
 * a phone; reduced-motion renders the finished state.
 */

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

const EASE = [0.25, 1, 0.5, 1] as const;

const STAGES = ["Transcribing", "Finding moments", "Rendering", "Ready"] as const;

// The real kit shape: 5 moments × 2 aspects + thread + 2 LinkedIn + newsletter = 14.
const CLIP_TITLES = ["Cold open", "The pivot", "Best line", "The stat", "Sign-off"];
const TEXT_ASSETS = [
  { label: "Thread", detail: "6 tweets" },
  { label: "LinkedIn", detail: "narrative" },
  { label: "LinkedIn", detail: "listicle" },
  { label: "Newsletter", detail: "412 words" },
];

const STAGE_MS = 1500;
const ASSET_MS = 260;
const HOLD_MS = 3600;

export function HeroDemo() {
  const reduce = useReducedMotion();
  const [stage, setStage] = useState(reduce ? 3 : 0);
  const [assets, setAssets] = useState(reduce ? 14 : 0);

  useEffect(() => {
    if (reduce) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => {
      timers.push(setTimeout(() => !cancelled && fn(), ms));
    };

    function runLoop() {
      setStage(0);
      setAssets(0);
      at(STAGE_MS, () => setStage(1));
      at(STAGE_MS * 2, () => setStage(2));
      // assets land during "Rendering"
      for (let i = 1; i <= 14; i++) {
        at(STAGE_MS * 2 + i * ASSET_MS, () => setAssets(i));
      }
      at(STAGE_MS * 2 + 14 * ASSET_MS + 200, () => setStage(3));
      at(STAGE_MS * 2 + 14 * ASSET_MS + HOLD_MS, runLoop);
    }
    runLoop();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [reduce]);

  const clipsShown = Math.min(assets, 10);
  const textShown = Math.max(0, assets - 10);

  return (
    <div className="card overflow-hidden" aria-label="Demo: one episode becoming a 14-asset content kit">
      {/* source row */}
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] p-4">
        <div className="min-w-0">
          <div className="t-title truncate">Episode 42 — The comeback</div>
          <div className="mono mt-0.5 text-[13px] text-[var(--color-faint)]">ep-42.mp3 · 62:14</div>
        </div>
        <span className={`stage-pill shrink-0 ${stage === 3 ? "is-ready" : "is-active"}`}>
          <span className="dot" />
          {STAGES[stage]}
        </span>
      </div>

      {/* progress hairline */}
      <div className="h-px bg-[var(--color-line)]">
        <motion.div
          className="h-px bg-[var(--color-brand)]"
          animate={{ width: `${((stage + 1) / 4) * 100}%` }}
          transition={{ duration: 0.6, ease: EASE }}
        />
      </div>

      {/* the kit assembling */}
      <div className="p-4">
        <div className="flex items-baseline justify-between">
          <span className="t-label">The kit</span>
          <span className="mono text-[13px] text-[var(--color-muted)]">
            <span className="text-[var(--color-paper)]">{assets}</span>/14 assets
          </span>
        </div>

        {/* clips: 5 moments × 2 aspects */}
        <div className="mt-3 grid grid-cols-5 gap-2">
          {CLIP_TITLES.map((t, i) => (
            <div key={t} className="space-y-2">
              {[0, 1].map((v) => {
                const idx = i * 2 + v;
                const on = idx < clipsShown;
                return (
                  <motion.div
                    key={v}
                    initial={false}
                    animate={{ opacity: on ? 1 : 0.18, y: on ? 0 : 4 }}
                    transition={{ duration: 0.3, ease: EASE }}
                    className={`relative overflow-hidden rounded-[6px] border border-[var(--color-line)] bg-[var(--color-panel-2)] ${
                      v === 0 ? "aspect-[9/16]" : "aspect-square"
                    }`}
                  >
                    {on && (
                      <div className="absolute inset-x-1 bottom-1 space-y-[3px]">
                        <div className="h-[3px] w-4/5 rounded-full bg-[var(--color-paper)]/80" />
                        <div className="h-[3px] w-3/5 rounded-full bg-[var(--color-brand)]/80" />
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="mono mt-2 text-[11px] text-[var(--color-faint)]">
          10 clips · 9:16 + 1:1 · captions burned in
        </div>

        {/* written assets */}
        <div className="mt-3 grid grid-cols-4 gap-2">
          {TEXT_ASSETS.map((a, i) => {
            const on = i < textShown;
            return (
              <motion.div
                key={i}
                initial={false}
                animate={{ opacity: on ? 1 : 0.18, y: on ? 0 : 4 }}
                transition={{ duration: 0.3, ease: EASE }}
                className="rounded-[6px] border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-2"
              >
                <div className="t-label !text-[9px]">{a.label}</div>
                <div className="mono mt-0.5 text-[10px] text-[var(--color-faint)]">{a.detail}</div>
              </motion.div>
            );
          })}
        </div>

        <AnimatePresence>
          {stage === 3 && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="mt-3 text-center text-[13px] text-[var(--color-muted)]"
            >
              Every asset grounded in the transcript.{" "}
              <span className="mono text-[var(--color-brand)]">62:14</span> in,{" "}
              <span className="text-[var(--color-paper)]">a week of posting</span> out.
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
