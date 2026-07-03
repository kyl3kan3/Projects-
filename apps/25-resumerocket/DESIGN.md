# ResumeRocket — Design Specification

## Design vision
Mission control for a job search. The user arrives anxious and leaves armed —
so the design converts anxiety into instrumentation: cool indigo confidence,
paper documents treated with respect, and the ATS made *visible* via the
product's signature X-ray. Never cute, never corporate-beige: the aesthetic of
a flight readiness review, because that's the emotional job.

## Brand identity

| Role | Color | Hex |
|---|---|---|
| Control indigo | `#141A3B` |
| Panel | `#1C2450` |
| Brand | Thrust blue | `#4F6DF5` |
| Match green | `#3DDC97` |
| Gap amber | `#FFC24D` |
| Paper (documents) | `#FCFCFA` |
| Text | `#EAEDF9` / muted `#8B93BC` — documents use ink `#1A1D29` |

- **Display:** `PP Right Grotesk` (fallback `Archivo`) condensed 700 for headers — launch-poster energy; **UI:** `Inter`; **the resume itself** offers three typographic suites (Classic serif `Source Serif 4`, Modern `Inter`, Compact `IBM Plex Sans`) — each ATS-safe, each typeset to book standards.
- **Logo:** an "R" whose leg is a rocket exhaust flame. Icon: R-flame on indigo.
- **Voice:** flight director. "Match score 84. Two gaps to close before you apply."

## Art direction
- **Two worlds, one seam:** the app chrome is control-room indigo; the document is bright paper center-stage under a soft spotlight — the resume always looks like the payload being prepared.
- Match scoring is a gauge language: circular readiness dials, thrust bars, gap chips — instrumentation, not grades (a 62 reads as "pre-flight work," not an F).
- Absolute honesty styling: AI-suggested content the user hasn't verified renders with a dashed amber underline + a "confirm" affordance — the fabrication guard as a visible design layer. Nothing dashed can be exported.

## The signature moment — "The X-Ray"
The free tool and the product's core loop share it. The user's resume (paper,
center) — a horizontal **X-ray sheet** sweeps down over it (600ms,
`ease-in-out-soft`): in the sheet's wake the document renders as the *machine
sees it* — a skeletal wireframe: parsed fields glow structured blue (name,
dates, titles snap into labeled boxes), while anything the parser can't read
stays as **dead gray static** (tables, columns, icons literally dissolve into
noise pixels). It's a jolt: your beautiful sidebar is invisible to the robot.
Then the repair pass: gap chips fly from a job-posting panel on the right and
dock onto the skeleton where keywords are missing (staggered arcs, 250ms each),
the match dial winding upward with each dock. Finale: the X-ray sheet sweeps
back up, restoring the human view — now annotated with what to fix. Shareable,
terrifying, and the single best lead magnet in the category.

## Motion system
- **Tailoring engine:** paste a posting → requirement chips extract from it one-by-one (keyword pops out of the text with a highlight, shrinks into a chip, files into covered/partial/missing columns, 80ms cadence); rewritten bullets slide in as suggestion cards with the dashed-amber treatment until accepted (checkmark press converts to solid ink).
- **Match dial:** winds with `spring-gentle` and *only moves on real changes*; the needle's rest position is honest (no fake 90s).
- **Export:** the document lifts off the desk (scale 1.02, shadow deepens), a compression shimmer passes, and the PDF chip lands in the tray with a thud — small launch, every time.
- **Application tracker:** stage columns (applied → interview → offer) with cards that carry their match dial as a mini-gauge; moving to "interview" fires a single thrust-blue streak under the card.
- **Alumni win-back (email + in-app):** the rocket motif returns gently — "Back on the pad?" with the user's previous best resume staged and ready.

## Key screens
1. **Free ATS X-Ray tool (the funnel):** drop a resume → the full X-Ray sequence → three findings free, the rest behind signup; this page gets marketing-tier polish since it IS the acquisition engine.
2. **Tailoring workspace (money screen):** posting panel right, resume paper center, gap chips between them, match dial top; the "apply-ready" state (all ambers resolved) triggers a quiet green readiness band — never confetti; job hunting is serious.
3. **Document editor:** paper-first WYSIWYG with the three type suites, section drag with `spring-gentle`, live one-page/two-page pagination indicator styled as a fuel gauge.
4. **Tracker:** the columns, plus a weekly cadence bar ("7 tailored apps this week") — momentum instrumentation.

## Component language
- Buttons: 8px radius, thrust blue; primary CTA on document screens sits on the control chrome, never on the paper.
- Chips: covered = green fill, partial = amber outline, missing = amber fill; all with the keyword in 12px mono.
- Cards: panel indigo, 12px radius; suggestion cards carry the dashed-amber left rule until confirmed.
- Empty state: an empty launch pad spotlight on paper: "Load your current resume. Any shape — we'll X-ray it."

## Reduced motion & fallback
X-Ray sweep → instant two-state toggle (human view / machine view) with a labeled switch. Chip flights → chips appear docked with a count-up. Dials → set positions with text values. The machine-view static remains (it's information).
