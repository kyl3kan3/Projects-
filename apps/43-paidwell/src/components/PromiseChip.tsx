import { IconHandshake } from "@/components/icons";
import { formatPromiseDate } from "@/lib/dates";
import type { PromiseStatus } from "@/db/schema";

const TONE: Record<PromiseStatus, string> = {
  open: "var(--color-amber)",
  kept: "var(--color-banker)",
  broken: "var(--color-red)",
};

/**
 * Height 28, radius 8, hairline, handshake glyph plus a mono date. Open reads
 * amber, kept banker, broken red with the date struck through — so the state is
 * legible without relying on colour alone.
 */
export function PromiseChip({
  status,
  promisedFor,
}: {
  status: PromiseStatus;
  promisedFor: string;
}) {
  return (
    <span className="chip" style={{ color: TONE[status] }}>
      <IconHandshake size={14} />
      <span style={{ textDecoration: status === "broken" ? "line-through" : undefined }}>
        {formatPromiseDate(promisedFor).toUpperCase()}
      </span>
      <span className="t-label" style={{ color: "inherit", letterSpacing: "0.06em" }}>
        {status}
      </span>
    </span>
  );
}
