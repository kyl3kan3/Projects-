"use client";

/**
 * Bulk export. A date range, a location, and two artifacts: the merged PDF a
 * lawyer reads and the CSV a spreadsheet reads. Both are plain GETs so a
 * download manager, a slow connection, and "save as" all behave normally.
 */

import { useState } from "react";
import { IconDownload } from "@/components/icons";

export function ExportPanel({
  locations,
  today,
  canCsv,
}: {
  locations: Array<{ id: string; name: string }>;
  today: string;
  canCsv: boolean;
}) {
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today);
  const [locationId, setLocationId] = useState("");

  const query = new URLSearchParams({ from, to });
  if (locationId) query.set("locationId", locationId);

  return (
    <div className="mt-3 flex flex-col gap-4">
      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-2">
          <span className="t-label">From</span>
          <input
            type="date"
            className="input input-mono"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="flex flex-1 flex-col gap-2">
          <span className="t-label">To</span>
          <input
            type="date"
            className="input input-mono"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>

      {locations.length > 1 ? (
        <label className="flex flex-col gap-2">
          <span className="t-label">Location</span>
          <select
            className="input"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
          >
            <option value="">All locations</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <a
          className="btn btn-secondary"
          href={`/api/exports/bulk?${query.toString()}`}
          target="_blank"
          rel="noreferrer"
        >
          <IconDownload size={16} />
          Merged PDF
        </a>
        {canCsv ? (
          <a
            className="btn btn-secondary"
            href={`/api/exports/csv?${query.toString()}`}
            target="_blank"
            rel="noreferrer"
          >
            <IconDownload size={16} />
            CSV
          </a>
        ) : (
          <span className="t-secondary self-center">CSV export is part of Front Desk.</span>
        )}
      </div>

      <p className="t-secondary">
        A merged export is capped at 500 records per pull. If your range holds more, the document
        says so on its first page rather than dropping any silently — narrow the dates and pull
        again.
      </p>
    </div>
  );
}
