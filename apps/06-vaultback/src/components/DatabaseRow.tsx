/**
 * A database row on the vault dashboard.
 *
 * No boxes: a full-bleed hairline row at least 64px tall, with the provider
 * glyph, the name, the mono age-and-size line, and the verified seal on the
 * right. The seal is green only once a checksum has passed — a pending database
 * gets a hollow text-3 outline, never an optimistic tick.
 */

import Link from "next/link";
import { IconBoltSlide, IconChevronRight, IconDatabase, IconShieldCheck } from "@/components/icons";
import { PROVIDER_LABELS } from "@/lib/providers";
import { formatBytes, timeAgo, timeUntil } from "@/lib/format";
import type { ConnectionHealth } from "@/lib/connections";

export function DatabaseRow({ health }: { health: ConnectionHealth }) {
  const { connection, policy, lastSnapshotAt, lastSnapshotBytes, runningJob, lastFailure } = health;

  const detail = runningJob
    ? `backing up · ${runningJob.stage}`
    : lastFailure
      ? `failed ${timeAgo(lastFailure.at)}`
      : lastSnapshotAt
        ? `${timeAgo(lastSnapshotAt)} · ${formatBytes(lastSnapshotBytes)}`
        : policy?.enabled
          ? `first backup ${timeUntil(policy.nextRunAt)}`
          : "no schedule";

  const detailColor = lastFailure
    ? "var(--color-torch)"
    : runningJob
      ? "var(--color-brass)"
      : "var(--color-text-2)";

  return (
    <Link href={`/vault/${connection.id}`} className="row">
      <span style={{ color: "var(--color-text-3)" }} title={PROVIDER_LABELS[connection.provider]}>
        <IconDatabase size={18} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="t-title block truncate">{connection.name}</span>
        <span className="t-data mt-2 block truncate" style={{ color: detailColor }}>
          {detail}
        </span>
      </span>

      {runningJob ? (
        <span style={{ color: "var(--color-brass)" }} aria-label="Backup running">
          <IconBoltSlide size={18} />
        </span>
      ) : (
        <span
          style={{ color: health.verified ? "var(--color-seal)" : "var(--color-text-3)" }}
          aria-label={health.verified ? "Verified snapshot" : "Not verified yet"}
        >
          <IconShieldCheck size={18} />
        </span>
      )}

      <span style={{ color: "var(--color-text-3)" }} aria-hidden="true">
        <IconChevronRight size={18} />
      </span>
    </Link>
  );
}
