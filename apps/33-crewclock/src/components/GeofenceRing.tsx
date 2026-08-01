"use client";

/**
 * The signature detail: the geofence ring.
 *
 * On clock-in a 1.5px foreman ring draws itself around the site dot over 400ms
 * ease-out-quart (stroke-dashoffset). On clock-out it un-draws over 300ms. One
 * draw per punch — never looping, never pulsing while on the clock.
 *
 * The ground beneath it is a plotted grid, not a map tile: it renders instantly,
 * needs no Mapbox token, and works with no signal — which is the situation the
 * crew screen is designed for. Where a token is configured the office site
 * picker can show real tiles; the crew screen deliberately does not depend on
 * one.
 *
 * Under `prefers-reduced-motion` the ring appears already drawn and the state is
 * spelled out in words beneath it — the animation is never the only messenger.
 */

export function GeofenceRing({
  state,
  label,
  caption,
}: {
  state: "on" | "off";
  /** The site name, e.g. "HENDRICKS PATIO". */
  label: string;
  /** The honest fence caption, already localized. */
  caption: string;
}) {
  return (
    <div className="minimap" role="img" aria-label={`${label} — ${caption}`}>
      <div className="minimap-grid" aria-hidden="true" />
      <svg className="ring-svg" viewBox="0 0 200 112" aria-hidden="true">
        {/* r=40 → circumference ≈ 252, the dash length in globals.css. Sized to
            clear the site label at the foot of the panel. */}
        <circle
          className="ring-path"
          cx="100"
          cy="46"
          r="40"
          data-draw={state === "on" ? "true" : "undraw"}
        />
        <circle className="site-dot" cx="100" cy="46" r="4" />
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-4">
        <span className="t-label" style={{ color: "var(--fg-2)" }}>
          {label}
        </span>
        <span className="t-secondary">{caption}</span>
      </div>
    </div>
  );
}
