/**
 * The blaze — this app's one signature detail (DESIGN.md).
 *
 * Two chevron strokes paint upward in sequence (140ms each, ease-out-quart,
 * 1.75px trail stroke), then the confirmation line stamps in beneath. Pure SVG
 * stroke-dashoffset plus one transform: no library, nothing to load, 60fps on a
 * five-year-old tablet. Total ≤480ms.
 *
 * Under `prefers-reduced-motion` both chevrons appear complete with a single
 * 100ms fade and the line is simply there — the confirmation is text either way,
 * so nothing is ever conveyed by movement alone (globals.css handles both).
 */

export function Blaze({
  size = 48,
  draw = true,
  className,
}: {
  size?: number;
  draw?: boolean;
  className?: string;
}) {
  return (
    <svg
      className={`blaze ${className ?? ""}`}
      data-draw={draw ? "true" : "false"}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path d="M4.5 11.5 10 6l5.5 5.5" />
      <path d="M4.5 16 10 10.5 15.5 16" />
    </svg>
  );
}

/**
 * The completed-signing confirmation: the blaze, then a line that names the
 * person. "You're signed in, Maya." — never a count, never a check mark.
 */
export function BlazeConfirmation({
  headline,
  detail,
  size = 48,
}: {
  headline: string;
  detail?: string;
  size?: number;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <Blaze size={size} />
      <div className="blaze-line">
        <div className="t-h2">{headline}</div>
        {detail ? (
          <div className="t-data mt-2" style={{ color: "var(--color-text-2)" }}>
            {detail}
          </div>
        ) : null}
      </div>
    </div>
  );
}
