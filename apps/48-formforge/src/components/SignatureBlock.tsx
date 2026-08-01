/**
 * The audit stamp — DESIGN.md's one signature detail, rendered.
 *
 * The signature replays as an SVG stroke over 600ms `ease-out-quart`; the mono
 * evidence line stamps in beneath it 8px from below, and a 1.5px teal underline
 * sweeps and fades. Reduced motion collapses all of it to a 100ms fade with the
 * evidence row already present (globals.css) — the state is always plain text plus
 * a stamp, never motion-only.
 *
 * A server component: it takes strings and draws them. `replay` is a prop rather
 * than a state machine because the only moment worth animating is the one right
 * after signing, and the practice's own review screen should not perform.
 */

export function SignatureBlock({
  kind,
  payload,
  signedName,
  monoLine,
  replay,
}: {
  kind: "typed" | "drawn";
  /** SVG path data for a drawn mark; ignored for a typed one. */
  payload: string;
  signedName: string;
  monoLine: string;
  replay: boolean;
}) {
  const drawn = kind === "drawn" && payload.trim().startsWith("M");

  return (
    <div>
      <div className={replay ? "sig-replay" : undefined} style={{ minHeight: 72 }}>
        {drawn ? (
          <svg
            viewBox="0 0 320 120"
            width="100%"
            height="96"
            preserveAspectRatio="xMinYMid meet"
            role="img"
            aria-label={`Signature of ${signedName}`}
          >
            <path className="sig-ink" d={payload} />
          </svg>
        ) : (
          <p className="sig-typed" style={{ margin: "8px 0 0" }}>
            {signedName}
          </p>
        )}
      </div>
      <div className="sig-line" />
      <p
        className={`t-data mt-3 ${replay ? "stamp stamp-sweep" : ""}`}
        style={{ color: "var(--color-ink-2)", display: "inline-block", wordBreak: "break-word" }}
      >
        {monoLine}
      </p>
    </div>
  );
}
