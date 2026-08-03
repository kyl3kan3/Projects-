"use client";

import { useActionState, useState } from "react";
import { generateReport, lockPeriod, unlockPeriod, type ReportState } from "./actions";
import { HoldToConfirm } from "@/components/HoldToConfirm";
import { IconDownload, IconLock } from "@/components/icons";

/**
 * Generate, download, lock.
 *
 * Two download paths, both honest about what they are: a server-rendered PDF where a
 * Chromium binary exists, and the browser's own print dialogue — which produces the same
 * A4 document from the same print stylesheet — everywhere else. If the server render is
 * unavailable the UI says so and points at the print view rather than failing silently.
 */
export function ReportControls({
  reportId,
  locked,
  year,
  canDownload,
  downloadReason,
  hasFigures,
}: {
  reportId: string | null;
  locked: boolean;
  year: number;
  canDownload: boolean;
  downloadReason: string;
  hasFigures: boolean;
}) {
  const [state, action, pending] = useActionState<ReportState, FormData>(generateReport, {});
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const id = state.reportId ?? reportId;

  async function downloadPdf() {
    if (!id) return;
    setPdfError(null);
    setDownloading(true);
    try {
      const res = await fetch(`/api/reports/${id}/pdf`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setPdfError(
          body.message ??
            "The server could not render a PDF here. Open the print view and use your browser's Print → Save as PDF.",
        );
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `greentally-${year}-ghg-inventory.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setPdfError("The PDF request failed. The print view still works.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="no-print">
      {state.error && (
        <p className="t-secondary mt-4" role="alert" style={{ color: "var(--color-red)" }}>
          {state.error}
        </p>
      )}
      {pdfError && (
        <p className="t-secondary mt-4" role="alert" style={{ color: "var(--color-amber-text)" }}>
          {pdfError}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-3">
        {canDownload ? (
          <>
            <form action={action}>
              <button
                type="submit"
                className="btn btn-primary btn-full"
                disabled={pending || !hasFigures}
              >
                {pending ? "Generating…" : id ? "Regenerate from current figures" : "Generate the report"}
              </button>
            </form>

            {id && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary btn-full"
                  onClick={downloadPdf}
                  disabled={downloading}
                >
                  <IconDownload size={18} />
                  {downloading ? "Rendering…" : "Download PDF"}
                </button>
                <a
                  href={`/report/print/${id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-quiet self-start"
                >
                  Open the print view
                </a>
              </>
            )}
          </>
        ) : (
          <p className="t-secondary" style={{ maxWidth: "48ch" }}>
            {downloadReason}
          </p>
        )}

        {canDownload &&
          (locked ? (
            <div className="panel p-4">
              <p className="t-label" style={{ color: "var(--color-accent-text)" }}>
                <IconLock size={14} /> Reporting year {year} is locked
              </p>
              <p className="t-secondary mt-2" style={{ maxWidth: "48ch" }}>
                Its figures are frozen, so a report you already sent to a customer stays
                reproducible. New uploads are blocked until it is unlocked.
              </p>
              <div className="mt-4">
                <HoldToConfirm
                  label="Hold to unlock the year"
                  holdingLabel="Unlocking…"
                  className="btn btn-secondary btn-full"
                  onConfirm={() => void unlockPeriod()}
                />
              </div>
            </div>
          ) : (
            <form action={lockPeriod}>
              <button type="submit" className="btn-quiet self-start" disabled={!hasFigures}>
                Lock reporting year {year}
              </button>
            </form>
          ))}
      </div>
    </div>
  );
}
