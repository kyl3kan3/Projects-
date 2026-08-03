"use client";

import { useActionState } from "react";
import type { CampaignState } from "../actions";

/**
 * Launch / pause / resume. Launching enrols the segment snapshot and schedules the
 * first step; it never sends inline, so a 600-patient launch cannot half-finish
 * inside a form POST.
 */
export function CampaignControls({
  campaignId,
  status,
  stepCount,
  canSend,
  launch,
  setStatus,
}: {
  campaignId: string;
  status: string;
  stepCount: number;
  canSend: boolean;
  launch: (state: CampaignState, formData: FormData) => Promise<CampaignState>;
  setStatus: (state: CampaignState, formData: FormData) => Promise<CampaignState>;
}) {
  const [launchState, launchAction, launching] = useActionState(launch, { error: null });
  const [statusState, statusAction, changing] = useActionState(setStatus, { error: null });
  const error = launchState.error ?? statusState.error;

  return (
    <>
      {error && (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-red)", marginBottom: 12 }}>
          {error}
        </p>
      )}

      {status === "draft" && (
        <form action={launchAction}>
          <input type="hidden" name="campaignId" value={campaignId} />
          <button
            className="btn btn-primary"
            type="submit"
            disabled={launching || stepCount === 0 || !canSend}
            style={{ width: "100%" }}
          >
            {launching ? "Enrolling…" : "Launch campaign"}
          </button>
          <p className="t-label" style={{ margin: "8px 0 0" }}>
            Enrols the segment now · first step goes out on the next send pass
          </p>
        </form>
      )}

      {status === "running" && (
        <form action={statusAction}>
          <input type="hidden" name="campaignId" value={campaignId} />
          <input type="hidden" name="status" value="paused" />
          <button className="btn btn-secondary" type="submit" disabled={changing} style={{ width: "100%" }}>
            {changing ? "Pausing…" : "Pause sending"}
          </button>
        </form>
      )}

      {status === "paused" && (
        <form action={statusAction} style={{ display: "grid", gap: 12 }}>
          <input type="hidden" name="campaignId" value={campaignId} />
          <input type="hidden" name="status" value="running" />
          <button
            className="btn btn-primary"
            type="submit"
            disabled={changing || !canSend}
            style={{ width: "100%" }}
          >
            {changing ? "Resuming…" : "Resume sending"}
          </button>
        </form>
      )}
    </>
  );
}
