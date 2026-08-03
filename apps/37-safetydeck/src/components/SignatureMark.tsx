/**
 * A captured signature, rendered from the stored stroke path.
 *
 * The strokes are vector path data taken from the pad, so this is the same mark
 * the person drew — not a screenshot of it, and not a font. It scales into a
 * dashboard row, a detail screen, and a PDF page from one stored value.
 */
export function SignatureMark({
  path,
  sourceWidth,
  sourceHeight,
  height = 44,
  className,
  ariaLabel,
}: {
  path: string;
  sourceWidth: number;
  sourceHeight: number;
  height?: number;
  className?: string;
  ariaLabel: string;
}) {
  const width = Math.round((sourceWidth / sourceHeight) * height);
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${sourceWidth} ${sourceHeight}`}
      className={className}
      role="img"
      aria-label={ariaLabel}
      style={{ overflow: "visible" }}
    >
      <path
        d={path}
        fill="none"
        stroke="var(--color-fg)"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
