"use client";

/**
 * The report's actions: export, share, and delete.
 *
 * Delete is hold-to-confirm (600ms radial fill, DESIGN.md) and re-states the retention
 * promise while the thumb is down. It is the one destructive control in the product and it
 * deletes the contract text along with the report, so it should take a deliberate second.
 */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteContractAction, revokeShareAction, shareReportAction } from "../actions";
import { IconCopy, IconDownload, IconMailDraft, IconTrash } from "@/components/icons";

const HOLD_MS = 600;

export function ReportActions({
  contractId,
  pdfPath,
  emailPath,
  initialShareUrl,
  retentionDays,
  retentionDate,
}: {
  contractId: string;
  pdfPath: string;
  emailPath: string;
  initialShareUrl: string | null;
  retentionDays: number;
  retentionDate: string;
}) {
  const router = useRouter();
  const [shareUrl, setShareUrl] = useState(initialShareUrl);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startHold = () => {
    setHolding(true);
    timer.current = setTimeout(async () => {
      setHolding(false);
      setBusy(true);
      await deleteContractAction(contractId);
      router.push("/contracts");
    }, HOLD_MS);
  };
  const cancelHold = () => {
    setHolding(false);
    if (timer.current) clearTimeout(timer.current);
  };

  return (
    <section className="hairline-t mt-10 pt-6 no-print">
      <p className="t-label">Share and export</p>

      <div className="mt-3 flex flex-wrap items-center gap-6">
        <a className="btn-quiet" href={pdfPath} download>
          <IconDownload size={18} />
          Export the PDF
        </a>
        <a className="btn-quiet" href={emailPath}>
          <IconMailDraft size={18} />
          Draft the email
        </a>
      </div>

      <div className="mt-6">
        {shareUrl ? (
          <>
            <p className="t-secondary" style={{ wordBreak: "break-all" }}>
              {shareUrl}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-6">
              <button
                type="button"
                className="btn-quiet btn-quiet-sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(shareUrl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1600);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                <IconCopy size={18} />
                {copied ? "Copied" : "Copy link"}
              </button>
              <button
                type="button"
                className="btn-quiet btn-quiet-sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await revokeShareAction(contractId);
                  setShareUrl(null);
                  setBusy(false);
                }}
              >
                Turn the link off
              </button>
            </div>
            <p className="t-secondary mt-2" style={{ color: "var(--color-text-3)" }}>
              Read-only, expires in 30 days, and anyone with it can open the report.
            </p>
          </>
        ) : (
          <button
            type="button"
            className="btn-quiet"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const { url } = await shareReportAction(contractId);
              setShareUrl(url);
              setBusy(false);
            }}
          >
            Create a read-only link
          </button>
        )}
      </div>

      <div className="hairline-t mt-8 pt-6">
        <p className="t-label">Retention</p>
        <p className="t-secondary mt-1.5">
          This contract and its report are deleted automatically on {retentionDate} —{" "}
          {retentionDays} days after upload. You can delete them now.
        </p>
        <button
          type="button"
          className="btn btn-secondary hold mt-4"
          data-holding={holding}
          disabled={busy}
          onPointerDown={startHold}
          onPointerUp={cancelHold}
          onPointerLeave={cancelHold}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") startHold();
          }}
          onKeyUp={cancelHold}
          style={{ color: "var(--color-oxblood)", width: "100%" }}
        >
          <IconTrash size={18} />
          {holding ? "Keep holding to delete…" : "Hold to delete this contract"}
        </button>
      </div>
    </section>
  );
}
