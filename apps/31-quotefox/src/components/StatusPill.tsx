import { IconCheck } from "@/components/icons";
import { TONE_COLOR, type Pill } from "@/lib/display";

/**
 * The status pill: a 6px dot and an 11px label. Accepted and deposit-paid get a
 * filled dot and a check — the only two states that earn emphasis.
 *
 * Every animated state in this product is also plain text in a pill, which is
 * what makes the reduced-motion path feature-complete rather than punitive.
 */
export function StatusPill({ pill }: { pill: Pill }) {
  const color = TONE_COLOR[pill.tone];
  return (
    <span className="pill" style={{ color }}>
      {pill.emphatic ? (
        <IconCheck size={14} style={{ marginRight: -2 }} />
      ) : (
        <span className="dot" style={{ background: color }} aria-hidden="true" />
      )}
      {pill.label}
    </span>
  );
}
