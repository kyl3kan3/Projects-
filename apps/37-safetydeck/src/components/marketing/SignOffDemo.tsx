/**
 * Beat 1: the machine running. A crew sign-off completing on a phone — the
 * signature draws itself, the timestamp stamps in, the roster row flips to its
 * green check, and the counter reaches 8 OF 8.
 *
 * Pure CSS on a server component: no JavaScript on the critical path, so the
 * hero is HTML and paint, not a canvas waiting for a bundle. Under
 * `prefers-reduced-motion` the strokes are simply drawn and the stamp is present
 * — the frame is complete either way, never a degraded placeholder.
 */

import { IconCheck } from "@/components/icons";

const CREW = [
  { name: "Marco Villalobos", title: "Foreman", at: "07:04" },
  { name: "Rubén Ortega", title: "Sheet metal journeyman", at: "07:05" },
  { name: "Tanya Brill", title: "Apprentice", at: "07:06" },
  { name: "Wes Kowalczyk", title: "Pipefitter", at: "07:08" },
  { name: "Dwayne Ferris", title: "Sheet metal journeyman", at: "07:09" },
  { name: "Ana Sepúlveda", title: "Welder", at: "07:10" },
  { name: "Curtis Nkemelu", title: "Apprentice", at: "07:11" },
  { name: "Jimmy Whitaker", title: "Operator", at: "07:12" },
];

/** A plausible hand-drawn mark, captured as vector strokes by the real pad. */
const SIGNATURE =
  "M 16 72 C 22 44 34 26 44 30 C 54 34 44 62 40 74 C 36 86 44 88 56 76 C 68 64 78 40 88 42 C 98 44 88 70 96 72 C 104 74 116 52 128 46 C 140 40 138 62 146 66 C 154 70 166 56 172 40 C 178 24 168 20 162 34 C 156 48 164 74 180 76 C 196 78 214 62 234 50 M 96 62 L 190 58";

export function SignOffDemo() {
  return (
    <div className="demo-phone">
      <div className="demo-screen">
        <p className="t-label">Harbor Point — Building C · 07:12</p>
        <p className="t-data demo-counter mt-2">8 OF 8 SIGNED</p>

        <div className="demo-pad mt-4">
          <svg viewBox="0 0 260 100" className="demo-sig" role="img" aria-label="A crew member's signature being captured on the phone">
            <path
              d={SIGNATURE}
              fill="none"
              stroke="var(--color-fg)"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={100}
            />
          </svg>
          <span className="demo-baseline" />
          <span className="t-label demo-stamp">07:12 · MAR 16 · SIGNED</span>
        </div>

        <ul className="demo-roster mt-4">
          {CREW.map((person, i) => (
            <li key={person.name} style={{ animationDelay: `${1300 + i * 150}ms` }}>
              <span>
                <span className="t-title">{person.name}</span>
                <span className="t-secondary block">{person.title}</span>
              </span>
              <span className="t-data demo-check">
                <IconCheck size={16} />
                {person.at}
              </span>
            </li>
          ))}
        </ul>
        <p className="t-secondary demo-sync mt-3">
          Captured offline at the huddle · synced 08:41
        </p>
      </div>
    </div>
  );
}
