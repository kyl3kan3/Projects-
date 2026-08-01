import { monogram } from "@/lib/format";

/**
 * The 40x40 monogram tile, radius 10, ivory letterform (DESIGN.md welcome band).
 * `solid` fills it with the brand colour — used on ivory grounds like the agency
 * dashboard, where a hairline tile would disappear.
 */
export function Monogram({
  name,
  solid = false,
  size = 40,
}: {
  name: string;
  solid?: boolean;
  size?: number;
}) {
  return (
    <span
      className={`monogram${solid ? " monogram-solid" : ""}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      aria-hidden="true"
    >
      {monogram(name)}
    </span>
  );
}
