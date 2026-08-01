"use client";

/**
 * Kiosk mode (DESIGN.md "Kiosk attract screen").
 *
 * Three properties matter more than anything visual:
 *
 *  1. **It resets completely.** The signing flow is mounted under a `key` that
 *     changes on every reset, so React discards the whole subtree. There is no
 *     "clear the fields" code path that can miss one — the previous signer's
 *     data cannot survive because the component holding it no longer exists.
 *  2. **It keeps working offline.** A failed post lands in IndexedDB and the
 *     header states the truth in mono ("3 QUEUED") rather than pretending.
 *  3. **It cannot reach the dashboard.** The session cookie is location-scoped
 *     and there is no navigation out of this screen.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Blaze } from "@/components/Blaze";
import { IconWifiOff } from "@/components/icons";
import { SignFlow, type SignFlowProps } from "@/components/SignFlow";
import { flushOutbox, queueDepth } from "@/lib/outbox";

const RESET_MS = 8000;

export function KioskShell({
  signProps,
  signedToday,
}: {
  signProps: Omit<SignFlowProps, "kiosk" | "channel" | "onComplete">;
  signedToday: number;
}) {
  const [active, setActive] = useState(false);
  const [session, setSession] = useState(0);
  const [count, setCount] = useState(signedToday);
  const [queued, setQueued] = useState(0);
  const [online, setOnline] = useState(true);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshQueue = useCallback(async () => {
    setQueued(await queueDepth());
  }, []);

  const sync = useCallback(async () => {
    const result = await flushOutbox();
    setQueued(result.remaining);
    if (result.sent > 0) {
      setSyncedAt(
        new Intl.DateTimeFormat("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }).format(new Date()),
      );
    }
  }, []);

  // Register the kiosk service worker so a reload during a Wi-Fi drop still
  // lands on the signing screen. Failure is non-fatal: without it the tablet
  // simply needs a connection to reload, and the outbox still protects
  // signatures captured mid-session.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => console.warn("[kiosk] service worker not registered", err));
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    void refreshQueue();
    const on = () => {
      setOnline(true);
      void sync();
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    // Also poll: "online" fires for a captive-portal Wi-Fi that cannot reach us.
    const timer = setInterval(() => {
      if (navigator.onLine) void sync();
    }, 30_000);
    void sync();
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      clearInterval(timer);
    };
  }, [refreshQueue, sync]);

  const reset = useCallback(() => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = null;
    setActive(false);
    setSession((s) => s + 1);
  }, []);

  const onComplete = useCallback(
    (names: string[]) => {
      setCount((c) => c + Math.max(1, names.length));
      void refreshQueue();
      void sync();
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(reset, RESET_MS);
    },
    [refreshQueue, reset, sync],
  );

  // Any tap cancels the pending auto-reset so a signer reading their receipt is
  // not interrupted; the reset then happens when they tap "Done".
  const cancelPendingReset = () => {
    if (resetTimer.current) {
      clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }
  };

  const syncLine =
    queued > 0
      ? `${queued} QUEUED`
      : syncedAt
        ? `SYNCED · ${syncedAt}`
        : online
          ? "ONLINE"
          : "OFFLINE";

  return (
    <div className="kiosk min-h-dvh" onPointerDown={active ? cancelPendingReset : undefined}>
      <header className="hairline-b flex items-center justify-between gap-4 px-8 py-4">
        <div className="flex items-center gap-2">
          <Blaze size={22} draw={false} />
          <span className="t-label">{signProps.venueName}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="t-data" style={{ color: "var(--color-text-2)" }}>
            {count} SIGNED TODAY
          </span>
          <span
            className="t-data flex items-center gap-1.5"
            style={{ color: queued > 0 || !online ? "var(--color-ember)" : "var(--color-text-3)" }}
          >
            {queued > 0 || !online ? <IconWifiOff size={16} /> : null}
            {syncLine}
          </span>
        </div>
      </header>

      {active ? (
        <div className="mx-auto w-full max-w-[640px]">
          {/* The key is the reset: a new session mounts a brand-new flow. */}
          <SignFlow key={session} {...signProps} kiosk channel="kiosk" onComplete={onComplete} />
          <div className="px-8 pb-10">
            <button className="btn btn-secondary btn-full btn-kiosk" onClick={reset}>
              Done — start the next person
            </button>
          </div>
        </div>
      ) : (
        <main className="flex min-h-[calc(100dvh-64px)] items-center justify-center px-8 py-10">
          <button
            className="sheet w-full max-w-[640px] px-8 py-16 text-center"
            onClick={() => {
              setSession((s) => s + 1);
              setActive(true);
            }}
          >
            <div className="flex justify-center">
              <Blaze size={48} draw={false} />
            </div>
            <p className="t-display mt-6">{signProps.venueName}</p>
            <p className="kiosk-body mt-4" style={{ color: "var(--color-text-2)" }}>
              Tap to sign the waiver
            </p>
            <p className="t-data mt-8" style={{ color: "var(--color-text-3)" }}>
              {signProps.waiverTitle.toUpperCase()} V{signProps.waiverVersion}
            </p>
          </button>
        </main>
      )}
    </div>
  );
}
