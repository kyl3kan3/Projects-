# Dunly — Design Specification

## Design vision
A recovery room for revenue: calm, precise, quietly triumphant. Dunly's job is to
hand money back to founders, so the design language is a Swiss private bank crossed
with a mission-control console — graphite surfaces, disciplined typography, and one
recurring emotion: the visible, satisfying *return* of money that was walking out
the door. Nothing cute. Money-serious.

## Brand identity

| Role | Color | Hex |
|---|---|---|
| Base | Graphite | `#101315` |
| Panel | Carbon | `#181D20` |
| Brand | Recovery green | `#2FD07E` |
| Brand deep | Bank green | `#0E8C52` |
| Warning | Dunning amber | `#F5B84D` |
| Danger | Churn red | `#F0655A` |
| Text | Paper | `#EDF1F0` / muted `#8FA099` |

- **Display:** `Söhne` (or `Instrument Sans`) — banking-grade neutrality, medium weight only.
- **Numerals are the brand:** all money renders in `Söhne Mono` tabular, with the cents at 60% size. The dollar sign always in Recovery green.
- **Logo:** "dunly" lowercase; the "u" drawn as a curved arrow returning to its baseline — money coming back. Favicon: the returning-u glyph.
- **Voice:** actuarial calm. "Recovered $1,840 this period." Never exclamation marks.

## Art direction
- Light theme option ships day one (finance buyers demo to CFOs): same structure, `#F7F9F8` base, carbon text.
- Depth is minimal — 1px hairlines (`#242B2E`) and a single elevation level. The *green glow is reserved exclusively for recovered money*; nothing else in the product may glow.
- Charts: thin 1.5px lines, no area fills except the recovered-revenue band which fills in green at 12% opacity.

## The signature moment — "The Return"
Marketing hero: a 3D particle system (R3F, GPU instanced ~4,000 coins as flat
discs) streaming *away* from a stylized ledger into darkness — involuntary churn,
in red-gray. A Dunly toggle in the hero flips on: a magnetic field (curl-noise
shader) bends the stream mid-flight and coins arc back, landing in the ledger with
staggered soft impacts; a mono counter ticks up in real time (`$0 → $48,392`)
synced to landings. The physics feel is the product pitch. In-product echo: every
real recovery event on the dashboard fires **one** coin arcing into the balance
(2D Lottie, 600ms `ease-out-expo`) — rate-limited to one per 5s, batched otherwise.

## Motion system
- **Recovered-revenue counter:** odometer digits roll upward with `spring-gentle`, blur 2px during motion (motion-blur cheat), land crisp.
- **Retry timeline:** each smart-retry attempt renders as a node on a horizontal timeline; pending nodes pulse at 4% opacity amplitude; success flips the node to green with a 300ms radial wipe, failure crossfades to amber and draws the connector to the next attempt (line draws left→right, 240ms).
- **Email sequence editor:** cards reorder with `spring-gentle` drag physics; dragging shows a green insertion hairline that snaps.
- **Table rows** (at-risk payments): enter with 24ms stagger, no y-movement (finance tables don't bounce) — opacity + 4px x-slide only.

## Key screens
1. **Marketing hero:** The Return scene full-bleed; single line of copy over it: "Failed payments aren't churn. They're a queue." CTA: "Start recovering".
2. **Command dashboard:** top band = three stat blocks (At risk / In recovery / **Recovered** — the last one 2× size, green); center = recovery timeline river showing every payment currently in a retry/dunning sequence as a swim-lane; right rail = live activity feed where recovery events land with the coin animation.
3. **Money screen — the ROI statement:** monthly view designed like a bank statement: serif-free, ruled hairlines, "Dunly recovered $X — 41× your subscription" as the closing line. Exportable as a beautiful PDF (this page IS the retention weapon).

## Component language
- Buttons: 8px radius, solid Recovery green with carbon text (AA-checked); destructive actions are outline-red requiring hold-to-confirm (600ms radial fill).
- Cards: hairline borders, no shadows in product; hover = border brightens.
- Empty state: ledger illustration with a single gray coin; "Connect Stripe and we'll find the money."
- The "unknown/at-risk" state color is a deliberate neutral slate — never alarmist red until truly failed.

## Reduced motion & fallback
Hero → poster of the mid-arc return moment. Coin events → the counter simply increments with a green flash. Odometers → direct number swap. Timeline pulses → static state dots.
