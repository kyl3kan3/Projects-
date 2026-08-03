"use client";

/**
 * The 5-second check-in.
 *
 * Search (3+ letters or a PIN) -> tap your card -> tap today's class -> done. The
 * class for your program is pre-selected, so the common path is two taps.
 *
 * Offline: dojo wifi is flaky, so a failed POST goes into a localStorage queue
 * with the client key already generated. The banner says how many are waiting,
 * in amber, and never blocks anybody. On reconnect the whole queue is replayed in
 * one request; the server's unique index on client_key means a replay of an
 * already-recorded tap is a no-op.
 *
 * After the tap: the counter ticks, the progress hairline advances, and the card
 * auto-returns to search in 2.5 seconds (beats 1-2 of the signature; a stripe
 * only seats on an actual promotion, which happens at a grading, not here).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { BeltBar } from "@/components/belt-bar";
import { IconBeltBar, IconCheck, IconSearch, IconWarning } from "@/components/icons";

interface KioskEnrollment {
  enrollmentId: string;
  programName: string;
  rankName: string;
  beltColorHex: string;
  stripesEarned: number;
  stripesTotal: number;
  classesDone: number;
  classesRequired: number;
  eligible: boolean;
  classes: { id: string; label: string; startsAtMinutes: number }[];
  preselectedClassId: string | null;
}

interface KioskStudent {
  studentId: string;
  name: string;
  enrollments: KioskEnrollment[];
}

interface QueuedCheckin {
  studentId: string;
  enrollmentId: string;
  classScheduleId: string | null;
  clientKey: string;
  at: string;
  studentName: string;
}

interface Confirmation {
  studentName: string;
  rankName: string;
  beltColorHex: string;
  stripesEarned: number;
  stripesTotal: number;
  classesDone: number;
  classesRequired: number;
  classLabel: string | null;
  queued: boolean;
  duplicate: boolean;
  previousFraction: number;
}

const QUEUE_KEY = "matpass.kiosk.queue.v1";

function loadQueue(): QueuedCheckin[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedCheckin[]) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedCheckin[]): void {
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // A full or disabled localStorage must not break check-in; the tap is still
    // attempted against the network, it just cannot be retried later.
  }
}

function newClientKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `kiosk:${crypto.randomUUID()}`;
  }
  return `kiosk:${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function Kiosk({ token, deviceName }: { token: string; deviceName: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<KioskStudent[]>([]);
  const [selected, setSelected] = useState<KioskStudent | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [queue, setQueue] = useState<QueuedCheckin[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revoked, setRevoked] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQueue(loadQueue());
  }, []);

  const flushQueue = useCallback(async () => {
    const pending = loadQueue();
    if (pending.length === 0) return;
    try {
      const response = await fetch("/api/kiosk/checkin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          checkins: pending.map((entry) => ({
            studentId: entry.studentId,
            enrollmentId: entry.enrollmentId,
            classScheduleId: entry.classScheduleId,
            clientKey: entry.clientKey,
            at: entry.at,
          })),
        }),
      });
      if (response.status === 403) {
        setRevoked(true);
        return;
      }
      if (!response.ok) return;
      const body = (await response.json()) as { results: { clientKey: string; ok: boolean }[] };
      const settled = new Set(body.results.filter((r) => r.ok).map((r) => r.clientKey));
      const remaining = pending.filter((entry) => !settled.has(entry.clientKey));
      saveQueue(remaining);
      setQueue(remaining);
    } catch {
      // Still offline. The queue stays exactly as it was.
    }
  }, [token]);

  useEffect(() => {
    void flushQueue();
    const onOnline = () => void flushQueue();
    window.addEventListener("online", onOnline);
    const timer = window.setInterval(() => void flushQueue(), 30_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(timer);
    };
  }, [flushQueue]);

  // Search, debounced. Three letters, or a four-digit PIN.
  useEffect(() => {
    const trimmed = query.trim();
    const isPin = /^\d{4,6}$/.test(trimmed);
    if (!isPin && trimmed.length < 3) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setError(null);
      try {
        const response = await fetch("/api/kiosk/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token, query: trimmed }),
          signal: controller.signal,
        });
        if (response.status === 403) {
          setRevoked(true);
          return;
        }
        const body = (await response.json()) as { students: KioskStudent[] };
        setResults(body.students ?? []);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError("Search needs the network. Check in anyone already on screen — it will queue.");
        }
      } finally {
        setSearching(false);
      }
    }, 220);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, token]);

  const reset = useCallback(() => {
    setSelected(null);
    setConfirmation(null);
    setQuery("");
    setResults([]);
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!confirmation) return;
    const timer = window.setTimeout(reset, 2500);
    return () => window.clearTimeout(timer);
  }, [confirmation, reset]);

  async function checkIn(student: KioskStudent, enrollment: KioskEnrollment, classId: string | null) {
    const entry: QueuedCheckin = {
      studentId: student.studentId,
      enrollmentId: enrollment.enrollmentId,
      classScheduleId: classId,
      clientKey: newClientKey(),
      at: new Date().toISOString(),
      studentName: student.name,
    };
    const previousFraction =
      enrollment.classesRequired > 0
        ? Math.min(1, enrollment.classesDone / enrollment.classesRequired)
        : 1;

    // Optimistic: the confirmation shows immediately, and the honest fallback is
    // the queued banner rather than a spinner nobody at a door will wait for.
    setConfirmation({
      studentName: student.name,
      rankName: enrollment.rankName,
      beltColorHex: enrollment.beltColorHex,
      stripesEarned: enrollment.stripesEarned,
      stripesTotal: enrollment.stripesTotal,
      classesDone: enrollment.classesDone + 1,
      classesRequired: enrollment.classesRequired,
      classLabel: enrollment.classes.find((c) => c.id === classId)?.label ?? null,
      queued: false,
      duplicate: false,
      previousFraction,
    });

    try {
      const response = await fetch("/api/kiosk/checkin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          checkins: [
            {
              studentId: entry.studentId,
              enrollmentId: entry.enrollmentId,
              classScheduleId: entry.classScheduleId,
              clientKey: entry.clientKey,
              at: entry.at,
            },
          ],
        }),
      });
      if (response.status === 403) {
        setRevoked(true);
        return;
      }
      if (!response.ok) throw new Error("bad response");
      const body = (await response.json()) as {
        results: {
          ok: boolean;
          duplicate: boolean;
          classesDone: number;
          classesRequired: number;
          classLabel: string | null;
          rankName: string;
          error?: string;
        }[];
      };
      const result = body.results[0];
      if (!result?.ok) {
        setConfirmation(null);
        setError(result?.error ?? "That check-in could not be recorded.");
        return;
      }
      setConfirmation((current) =>
        current
          ? {
              ...current,
              classesDone: result.classesDone,
              classesRequired: result.classesRequired,
              classLabel: result.classLabel,
              duplicate: result.duplicate,
            }
          : current,
      );
    } catch {
      const next = [...loadQueue(), entry];
      saveQueue(next);
      setQueue(next);
      setConfirmation((current) => (current ? { ...current, queued: true } : current));
    }
  }

  if (revoked) {
    return (
      <main className="world-kiosk screen-narrow" style={{ paddingTop: 80 }}>
        <span className="fg-3">
          <IconBeltBar size={26} />
        </span>
        <h1 className="t-h2" style={{ marginTop: 16 }}>
          This kiosk has been revoked
        </h1>
        <p className="t-body fg-2" style={{ marginTop: 12 }}>
          Ask the front desk for a new kiosk link. Check-ins already recorded from this tablet are
          safe on the ledger.
        </p>
      </main>
    );
  }

  return (
    <main className="world-kiosk screen-plain" style={{ minHeight: "100vh" }}>
      <header
        className="flex items-center justify-between gap-3"
        style={{ paddingTop: 20, paddingBottom: 20 }}
      >
        <span className="flex items-center gap-2 fg">
          <span className="crimson">
            <IconBeltBar size={26} />
          </span>
          <span className="t-title">Check in</span>
        </span>
        <span className="t-secondary fg-3">{deviceName}</span>
      </header>

      {queue.length > 0 ? (
        <div
          className="card"
          role="status"
          style={{ padding: 16, marginBottom: 20, display: "flex", gap: 12, alignItems: "center" }}
        >
          <span className="amber" style={{ flex: "none" }}>
            <IconWarning size={26} />
          </span>
          <span className="t-body amber">
            {queue.length} check-in{queue.length === 1 ? "" : "s"} queued — will sync
          </span>
        </div>
      ) : null}

      {confirmation ? (
        <section className="sheet sheet-enter" style={{ padding: 24 }}>
          <div className="flex items-center gap-3">
            <span className="green" style={{ flex: "none" }}>
              <IconCheck size={26} />
            </span>
            <p className="t-kiosk-name">{confirmation.studentName}</p>
          </div>
          <p className="t-body fg-2" style={{ marginTop: 8 }}>
            {confirmation.duplicate
              ? "Already checked in for this class — nothing recorded twice."
              : (confirmation.classLabel ?? "Open mat")}
          </p>
          <div style={{ marginTop: 20 }}>
            <BeltBar
              beltColorHex={confirmation.beltColorHex}
              rankName={confirmation.rankName}
              stripesEarned={confirmation.stripesEarned}
              stripesTotal={confirmation.stripesTotal}
              classesDone={confirmation.classesDone}
              classesRequired={confirmation.classesRequired}
              size="kiosk"
              fillFrom={confirmation.previousFraction}
              showFigures={false}
            />
          </div>
          <p className="t-data-lg" style={{ marginTop: 16 }}>
            <span className="tick">{confirmation.classesDone}</span>
            {confirmation.classesRequired > 0 ? ` / ${confirmation.classesRequired} classes` : " classes"}
          </p>
          {confirmation.queued ? (
            <p className="t-body amber" style={{ marginTop: 12 }}>
              Saved on this tablet — it will sync when the wifi is back.
            </p>
          ) : null}
          <button type="button" className="btn btn-secondary btn-full" style={{ marginTop: 24 }} onClick={reset}>
            Next student
          </button>
        </section>
      ) : selected ? (
        <section className="sheet sheet-enter" style={{ padding: 24 }}>
          <p className="t-kiosk-name">{selected.name}</p>
          {selected.enrollments.length === 0 ? (
            <p className="t-body fg-2" style={{ marginTop: 12 }}>
              Not enrolled in a program yet — ask the front desk.
            </p>
          ) : null}
          {selected.enrollments.map((enrollment) => (
            <div key={enrollment.enrollmentId} style={{ marginTop: 24 }}>
              <BeltBar
                beltColorHex={enrollment.beltColorHex}
                rankName={enrollment.rankName}
                stripesEarned={enrollment.stripesEarned}
                stripesTotal={enrollment.stripesTotal}
                classesDone={enrollment.classesDone}
                classesRequired={enrollment.classesRequired}
                size="kiosk"
                met={enrollment.eligible}
              />
              <p className="t-body fg-2" style={{ marginTop: 12 }}>
                {enrollment.programName} · {enrollment.rankName}
              </p>
              {enrollment.classes.length > 0 ? (
                <div className="chip-row" style={{ marginTop: 16 }}>
                  {enrollment.classes.map((slot) => (
                    <button
                      key={slot.id}
                      type="button"
                      className="chip"
                      data-active={slot.id === enrollment.preselectedClassId ? "true" : undefined}
                      style={{ minHeight: 56 }}
                      onClick={() => void checkIn(selected, enrollment, slot.id)}
                    >
                      {slot.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <button
                type="button"
                className="btn btn-primary btn-full"
                style={{ marginTop: 16 }}
                onClick={() =>
                  void checkIn(selected, enrollment, enrollment.preselectedClassId)
                }
              >
                Check in
                {enrollment.preselectedClassId
                  ? ""
                  : enrollment.classes.length > 0
                    ? ""
                    : " — open mat"}
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-secondary btn-full" style={{ marginTop: 24 }} onClick={reset}>
            Not me
          </button>
        </section>
      ) : (
        <>
          <div style={{ position: "relative" }}>
            <span
              className="fg-3"
              style={{ position: "absolute", left: 16, top: 16, pointerEvents: "none" }}
            >
              <IconSearch size={26} />
            </span>
            <input
              ref={searchRef}
              className="input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Your name, or your PIN"
              autoFocus
              autoComplete="off"
              enterKeyHint="search"
              aria-label="Your name or PIN"
              style={{ paddingLeft: 56 }}
            />
          </div>

          {error ? (
            <p className="t-body amber" style={{ marginTop: 16 }} role="alert">
              {error}
            </p>
          ) : null}

          {query.trim().length > 0 && query.trim().length < 3 && !/^\d{4,6}$/.test(query.trim()) ? (
            <p className="t-body fg-3" style={{ marginTop: 16 }}>
              Three letters is enough.
            </p>
          ) : null}

          {results.length === 0 && query.trim().length >= 3 && !searching ? (
            <p className="t-body fg-2" style={{ marginTop: 24 }}>
              Nobody by that name is on the active roster. Try your surname, or ask the front desk.
            </p>
          ) : null}

          <div className="stagger" style={{ marginTop: 16 }}>
            {results.map((student) => (
              <button
                key={student.studentId}
                type="button"
                className="card"
                style={{
                  padding: 20,
                  marginBottom: 12,
                  width: "100%",
                  textAlign: "left",
                  minHeight: 56,
                }}
                onClick={() => {
                  setSelected(student);
                  setError(null);
                }}
              >
                <p className="t-title">{student.name}</p>
                {student.enrollments[0] ? (
                  <div style={{ marginTop: 12 }}>
                    <BeltBar
                      beltColorHex={student.enrollments[0].beltColorHex}
                      rankName={student.enrollments[0].rankName}
                      stripesEarned={student.enrollments[0].stripesEarned}
                      stripesTotal={student.enrollments[0].stripesTotal}
                      classesDone={student.enrollments[0].classesDone}
                      classesRequired={student.enrollments[0].classesRequired}
                      size="kiosk"
                      met={student.enrollments[0].eligible}
                    />
                  </div>
                ) : null}
              </button>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
