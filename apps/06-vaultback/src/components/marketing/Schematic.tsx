/**
 * The blueprint schematic that sits behind the hero on phones — hairlines only,
 * no canvas, no WebGL, and it costs nothing on the mobile critical path
 * (DESIGN_LANGUAGE performance rules). It draws the actual pipeline: your
 * database, our process, your bucket, and the scratch database a drill uses.
 */

export function Schematic() {
  return (
    <svg
      className="schematic w-full"
      viewBox="0 0 360 120"
      fill="none"
      stroke="currentColor"
      strokeWidth={1}
      aria-hidden="true"
      style={{ color: "var(--color-hairline)" }}
    >
      {/* source database */}
      <ellipse cx="34" cy="30" rx="22" ry="7" />
      <path d="M12 30v22c0 3.9 9.8 7 22 7s22-3.1 22-7V30" />
      <path d="M12 41c0 3.9 9.8 7 22 7s22-3.1 22-7" />

      {/* leg to the process */}
      <path d="M60 44h44" strokeDasharray="4 4" />

      {/* the process box */}
      <rect x="106" y="24" width="96" height="40" rx="6" />
      <path d="M118 44h12M136 38h20M136 50h28" style={{ color: "var(--color-text-3)" }} />

      {/* leg to the bucket */}
      <path d="M204 44h44" strokeDasharray="4 4" style={{ color: "var(--color-brass)" }} />

      {/* bucket */}
      <path d="M252 30h44l-5 34a5 5 0 0 1-5 4h-24a5 5 0 0 1-5-4l-5-34Z" />
      <path d="M252 30c0-4 10-7 22-7s22 3 22 7" />

      {/* drill branch: down from the process into a scratch database */}
      <path d="M154 64v22h60" strokeDasharray="3 5" />
      <ellipse cx="238" cy="86" rx="18" ry="6" />
      <path d="M220 86v14c0 3.3 8.1 6 18 6s18-2.7 18-6V86" />
      <circle cx="292" cy="86" r="9" style={{ color: "var(--color-seal)" }} />
      <path d="M288 86l3 3 5-6" style={{ color: "var(--color-seal)" }} strokeWidth={1.5} />
    </svg>
  );
}
