/**
 * The pipeline strip: DUMP → COMPRESS → ENCRYPT → UPLOAD → VERIFY.
 *
 * Five labelled stations as 11px labels over 8px nodes joined by hairlines, in
 * its own horizontal scroll track. Completed nodes are seal; the active leg
 * carries the one piece of ambient motion in the product, and only while a real
 * backup is running (DESIGN.md motion rules).
 */

import type { Stage } from "@/db/schema";

const STATIONS: { stage: Stage; label: string }[] = [
  { stage: "dump", label: "Dump" },
  { stage: "compress", label: "Compress" },
  { stage: "encrypt", label: "Encrypt" },
  { stage: "upload", label: "Upload" },
  { stage: "verify", label: "Verify" },
];

export function Pipeline({
  stage,
  /** A finished job shows every station sealed; a failed one stops where it broke. */
  state = "running",
}: {
  stage: Stage;
  state?: "running" | "done" | "failed";
}) {
  const index = state === "done" ? STATIONS.length : STATIONS.findIndex((s) => s.stage === stage);
  const activeIndex = index < 0 ? 0 : index;

  return (
    <div className="pipeline" role="group" aria-label="Backup pipeline">
      {STATIONS.map((station, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex && state === "running";
        const stationState = done ? "done" : active ? "active" : "idle";
        return (
          <div key={station.stage} className="flex flex-1 items-start">
            <div className="pipeline-station" data-state={stationState}>
              <span
                className="t-label"
                style={{
                  color: done
                    ? "var(--color-seal)"
                    : active
                      ? "var(--color-brass)"
                      : "var(--color-text-3)",
                }}
              >
                {station.label}
              </span>
              <span className="pipeline-node" />
            </div>
            {i < STATIONS.length - 1 ? (
              <span
                className="pipeline-leg"
                data-state={done ? "done" : active ? "active" : "idle"}
                aria-hidden="true"
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
