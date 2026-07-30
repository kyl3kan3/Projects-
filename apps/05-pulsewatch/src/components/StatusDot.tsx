import type { MonitorStatus } from "@/db/schema";

/**
 * Flat 8px status dot — no bloom, no glow (DESIGN.md elevation rules).
 * Phosphor steady when up, red pulsing 1s when down, amber breathing 3s when
 * degraded. Always accompanied by text elsewhere in the row.
 */
export function StatusDot({ status, label }: { status: MonitorStatus; label?: string }) {
  const cls =
    status === "up"
      ? "dot dot-up"
      : status === "down"
        ? "dot dot-down"
        : status === "paused"
          ? "dot dot-paused"
          : "dot dot-pending";
  return <span className={cls} role="img" aria-label={label ?? statusWord(status)} />;
}

export function statusWord(status: MonitorStatus): string {
  switch (status) {
    case "up":
      return "UP";
    case "down":
      return "DOWN";
    case "paused":
      return "PAUSED";
    default:
      return "PENDING";
  }
}

export function statusColor(status: MonitorStatus): string {
  switch (status) {
    case "up":
      return "var(--color-phosphor)";
    case "down":
      return "var(--color-red)";
    case "paused":
      return "var(--color-text-3)";
    default:
      return "var(--color-amber)";
  }
}
