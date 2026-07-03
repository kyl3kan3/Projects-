# ParseFlow — Design Specification

## Design vision
A precision instrument for developers: the moment a messy PDF becomes clean JSON,
made visible and beautiful. ParseFlow's aesthetic is "laboratory monochrome" —
paper white and carbon black split down the middle, with syntax color used the
way a lab uses reagent dyes: sparingly, meaningfully. The docs ARE the product,
so typography and code presentation get fashion-brand attention.

## Brand identity

| Role | Color | Hex |
|---|---|---|
| Carbon | `#0C0D10` |
| Paper | Document white | `#FAFAF8` |
| Brand | Extraction green | `#10B981` |
| Key syntax | `#7DD3FC` |
| String syntax | `#FDE68A` |
| Number syntax | `#F0ABFC` |
| Confidence low | Honest gray | `#9CA3AF` |
| Text | `#E7E9EE` on carbon / `#17181C` on paper |

- **Display:** `Söhne` (fallback `Instrument Sans`); **everything code/JSON:** `Berkeley Mono` (fallback `JetBrains Mono`) — the JSON output is the brand's face and must be typeset like poetry: 1.7 line-height, generous indentation guides at 8% opacity.
- **Logo:** `{ }` braces enclosing a paper-corner fold — document-in-braces. Icon: the fold-brace on carbon.
- **Voice:** engineer-to-engineer. "94% confident on `total_amount`. Here's why."

## Art direction
- **The split is the layout religion:** paper (input) left, carbon (output) right, meeting at a hard vertical seam. Marketing, playground, and docs all honor it.
- Confidence is a first-class visual dimension: every extracted field carries a 3px confidence underline (green ≥90, amber 70–89, gray "honest unknown" below) — the honesty positioning rendered as design.
- Document imagery is always shown as real scanned texture (slight skew, scan noise) — celebrating the mess we tame.

## The signature moment — "The Dissolve"
Marketing hero, on the seam: a crumpled invoice (2.5D plane with wrinkle normal
map) un-crumples and flattens (700ms). Then extraction runs as visible physics:
**each value on the document lifts off as glowing type**, drifts across the seam
with a slight arc (per-field, 350ms, 90ms stagger — amount, date, vendor, line
items), and *snaps into its place in a growing JSON tree* on the carbon side,
key names typing themselves as each value docks. Confidence underlines draw
beneath each landed value. One field (a smudged total) crosses slowly, wobbles,
and lands with a gray underline and `"confidence": 0.61` — the honest-unknown
shown proudly in the hero. Loop 12s. The playground reuses this exact animation
on real user uploads at 2× speed — demo and product are the same artifact.

## Motion system
- **Playground parse:** the document preview gets a thin scan-beam pass (top→bottom, 500ms) synchronized with fields lifting; the JSON pane assembles with the docking animation; total parse time displayed in mono as a lab reading ("1.84s · 3 pages").
- **Field hover (both sides):** hovering JSON highlights the source region on the document with a green bounding box that draws its stroke (150ms) — provenance as interaction; reverse hover works identically.
- **Schema builder (custom schemas):** dragging a field type into the schema tree grows a new branch (`spring-gentle`); the sample JSON preview updates with a single-field re-dock.
- **API key reveal:** the key un-redacts with a left-to-right character resolve (300ms) and auto-re-redacts after 20s (visible countdown ring on the copy button).
- **Usage meter:** a burette-style vertical gauge fills with the month's pages; volume-tier marks etched at thresholds.

## Key screens
1. **Marketing hero:** The Dissolve across the seam; beneath, a curl command and three-line quickstart typeset large — code as hero copy; then the honest-accuracy section: our benchmark table including the numbers we *lose* on (design mandates showing one).
2. **Playground (money screen):** the split — drop zone left, JSON right, schema picker as tabs on the seam; every parse animates; a "copy as code" flyout renders the equivalent Python/Node call.
3. **Docs:** paper theme, seam preserved as margin rule; every endpoint has a run-it-live cell wired to the playground; response schemas render with the same syntax palette.
4. **Dashboard:** carbon; keys, burette usage gauge, per-doc-type accuracy sparklines, webhook delivery log with signed-payload badges.

## Component language
- Buttons: 8px radius; primary extraction-green with carbon text; on paper side, carbon-outline. Press = 0.97 scale, no glow (lab restraint).
- JSON blocks: recessed wells with indentation guides; keys/strings/numbers in the reagent palette; copy button top-right appears on hover.
- Empty state: an empty tray on the paper side: "Feed me a document. Any document."
- Errors: full JSON error objects shown honestly, typeset as nicely as success.

## Reduced motion & fallback
Dissolve → static before/after split with provenance boxes pre-drawn. Field docking → JSON fades in complete. Scan beams off. Provenance hover-highlighting retained without stroke animation (instant box).
