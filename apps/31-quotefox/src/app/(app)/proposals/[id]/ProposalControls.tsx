"use client";

import { useRef, useState, useTransition } from "react";
import { IconAlert, IconClose, IconRefresh } from "@/components/icons";
import { resendProposalAction, withdrawProposalAction } from "./actions";

/**
 * Re-send rotates the link (the old URL stops working), and withdrawing is
 * hold-to-confirm because it kills a live link a homeowner may be reading.
 */
export function ProposalControls({
  proposalId,
  canWithdraw,
}: {
  proposalId: string;
  canWithdraw: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [holding, setHolding] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <button
        className="btn btn-secondary btn-full"
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          setMessage(null);
          startTransition(async () => {
            const result = await resendProposalAction(proposalId);
            if (result.error) setError(result.error);
            else
              setMessage(
                result.emailed
                  ? "Sent again with a fresh link. The old link no longer opens."
                  : `Fresh link minted (email is not sending from this install): ${result.url}`,
              );
          });
        }}
      >
        <IconRefresh size={18} />
        {pending ? "Working…" : "Re-send with a fresh link"}
      </button>

      {canWithdraw ? (
        <button
          className="btn btn-danger btn-full"
          type="button"
          style={{ position: "relative", overflow: "hidden" }}
          disabled={pending}
          onPointerDown={() => {
            setHolding(true);
            holdTimer.current = setTimeout(() => {
              setHolding(false);
              startTransition(async () => {
                const result = await withdrawProposalAction(proposalId);
                if (result.error) setError(result.error);
                else setMessage("Withdrawn. The link no longer opens.");
              });
            }, 600);
          }}
          onPointerUp={() => {
            if (holdTimer.current) clearTimeout(holdTimer.current);
            setHolding(false);
          }}
          onPointerLeave={() => {
            if (holdTimer.current) clearTimeout(holdTimer.current);
            setHolding(false);
          }}
        >
          <span
            className="hold-fill"
            data-holding={holding}
            style={{
              borderRadius: 8,
              background: "color-mix(in srgb, var(--color-red) 22%, transparent)",
            }}
          />
          <IconClose size={18} />
          Hold to withdraw
        </button>
      ) : null}

      {message ? (
        <p className="t-secondary" style={{ color: "var(--color-hi-vis)", wordBreak: "break-all" }}>
          {message}
        </p>
      ) : null}
      {error ? (
        <p
          className="t-secondary"
          role="alert"
          style={{ color: "var(--color-red)", display: "flex", gap: 8 }}
        >
          <IconAlert size={18} style={{ flex: "none" }} />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
