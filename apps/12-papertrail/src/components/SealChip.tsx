import { sealVariant, statusLabel } from "@/lib/documents";
import type { DocumentStatus, DocumentType } from "@/db/schema";

/**
 * The status chip. Its word carries the status on its own — nothing here
 * depends on colour or on animation (DESIGN.md, reduced-motion clause).
 */
export function SealChip({
  type,
  status,
  pressed = false,
}: {
  type: DocumentType;
  status: DocumentStatus;
  /** True right after the status changed in this render — presses the seal in. */
  pressed?: boolean;
}) {
  return (
    <span
      className={`seal${pressed ? " seal-press" : ""}`}
      data-variant={sealVariant(status)}
      aria-label={`Status: ${statusLabel(type, status)}`}
    >
      {statusLabel(type, status)}
    </span>
  );
}
