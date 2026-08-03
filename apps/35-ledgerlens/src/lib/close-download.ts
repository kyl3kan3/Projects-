/**
 * Serving one file out of a close package.
 *
 * Shared by the operator's download route and the accountant's share route, so the two
 * cannot drift into disagreeing about what "the QuickBooks CSV for March" is. Both
 * callers do their own authorisation first; this function only knows how to produce
 * bytes.
 *
 * The PDF and ZIP are read back from storage — they are the artifact that was built and
 * versioned at close time, and regenerating them on download would mean the accountant
 * and the operator could hold different files with the same name. The CSVs are rendered
 * on demand from the same confirmed rows, which is a convenience for someone who wants
 * one format without unzipping.
 */

import type { Organization, ClosePeriod } from "@/db/schema";
import { confirmedRows } from "@/lib/close-package";
import { EXPORT_FILENAMES, renderExport, type ExportKind } from "@/lib/exports";
import { getObject } from "@/lib/storage";
import { plan } from "@/lib/plans";

export type DownloadKind = "pdf" | "zip" | "csv" | "qbo" | "xero";

export function isDownloadKind(value: string): value is DownloadKind {
  return value === "pdf" || value === "zip" || value === "csv" || value === "qbo" || value === "xero";
}

export interface Download {
  bytes: Uint8Array;
  mime: string;
  filename: string;
}

export type DownloadResult =
  | { ok: true; download: Download }
  | { ok: false; reason: "not_closed" | "missing" | "plan_gated" };

export async function buildDownload(
  org: Organization,
  record: ClosePeriod,
  kind: DownloadKind,
): Promise<DownloadResult> {
  if (record.status !== "closed") return { ok: false, reason: "not_closed" };
  if ((kind === "qbo" || kind === "xero") && !plan(org.plan).accountingExports) {
    return { ok: false, reason: "plan_gated" };
  }

  const period = record.period;

  if (kind === "pdf" || kind === "zip") {
    const key = kind === "pdf" ? record.pdfStorageKey : record.packageStorageKey;
    if (!key) return { ok: false, reason: "missing" };
    try {
      const bytes = await getObject(key);
      return {
        ok: true,
        download: {
          bytes,
          mime: kind === "pdf" ? "application/pdf" : "application/zip",
          filename:
            kind === "pdf" ? `ledgerlens-${period}-summary.pdf` : `ledgerlens-${period}.zip`,
        },
      };
    } catch {
      return { ok: false, reason: "missing" };
    }
  }

  const exportKind: ExportKind = kind === "csv" ? "generic" : kind;
  const rows = await confirmedRows(org.id, period);
  return {
    ok: true,
    download: {
      bytes: new Uint8Array(Buffer.from(renderExport(exportKind, rows), "utf8")),
      mime: "text/csv; charset=utf-8",
      filename: EXPORT_FILENAMES[exportKind](period),
    },
  };
}

export function downloadResponse(download: Download): Response {
  return new Response(Buffer.from(download.bytes), {
    headers: {
      "content-type": download.mime,
      "content-disposition": `attachment; filename="${download.filename}"`,
      "content-length": String(download.bytes.byteLength),
      // Financial records: never let a shared cache hold a copy.
      "cache-control": "private, no-store",
    },
  });
}
