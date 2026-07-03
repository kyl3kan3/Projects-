# ParseFlow — Design Specification

## 1. Vision
ParseFlow turns a messy PDF into clean, confidence-scored JSON — documented like
Stripe, priced per page. The docs *are* the product, so typography and code
presentation get fashion-brand attention: laboratory monochrome, paper white and
carbon black, syntax color used like reagent dye — sparingly, meaningfully.

## 2. Mobile layout (390×844)
Developers integrate on a laptop, but they *evaluate on a phone* — reading the docs
and quickstart on the couch, checking usage between things. Mobile leads with
reading and confidence, not authoring.

- **Nav:** a top bar with a menu button opening a full-height nav **sheet** (Docs
  sections, Playground, Dashboard). The primary action — **"Try in playground"**
  or **"Copy curl"** — is a filled extraction-green button in the thumb zone.
- **The split becomes a stack:** the desktop "paper left / carbon right" seam
  collapses to a vertical order on mobile — document input on top, JSON output
  below, a thin seam rule between. Wide JSON scrolls inside its own
  `overflow-x:auto` well; the page never scrolls sideways.
- **Playground (mobile):** drop/pick a document up top, schema picker as a chip
  scroller, JSON result below with copy button and a mono "1.84s · 3 pages" reading.
- **Docs:** single column, ~65ch measure, `Berkeley Mono` code blocks in recessed
  wells with a copy button; every field carries its confidence underline.
- Body ≥16px; code ≥15px mono; targets ≥44px.

## 3. Identity
| Role | Name | Hex |
|---|---|---|
| Base | Carbon | `#0C0D10` |
| Paper | Document white | `#FAFAF8` |
| Brand | Extraction green | `#10B981` |
| Key syntax | Sky | `#7DD3FC` |
| String / number | `#FDE68A` / `#F0ABFC` |
| Confidence-low | Honest gray | `#9CA3AF` |

- **Display:** `Söhne` (fallback `Instrument Sans`). **All code/JSON:** `Berkeley
  Mono` (fallback `JetBrains Mono`) — the JSON is the brand's face: 1.7 line-height,
  8%-opacity indentation guides.
- **Logo:** `{ }` braces around a paper-corner fold — document-in-braces.
- **Signature detail — provenance & confidence.** Every extracted field carries a
  3px confidence underline (green ≥90, amber 70–89, gray "honest unknown" below) —
  the honesty positioning rendered as design. **Tap (or hover) a JSON field and its
  source region highlights on the document** with a green box that draws its stroke
  (150ms); the reverse works too. Cheap SVG overlay, fully touch-native — this
  interaction *is* the wow, not a crumpling-invoice 3D scene.

## 4. Responsive
Mobile stacks input-over-output; **desktop restores the split seam** (paper input
left, carbon output right, hard vertical seam) across marketing, playground, and
docs. **Optional desktop-only enhancement (marketing hero):** "the dissolve" —
values lift off a scanned document, arc across the seam, and dock into a growing
JSON tree, one smudged total landing at `0.61` gray. 2.5D/canvas, lazy behind a
static before/after poster, pointer-only, never in the mobile or app bundle. Mobile
gets the static split with provenance taps, complete on its own.

## 5. Motion & touch
- Shared tokens: field docking (desktop hero) `ease-out-quart` 90ms stagger;
  schema-tree growth `spring-gentle`; presses `dur-micro`, 0.97 scale, no glow
  (lab restraint).
- **Playground parse:** a thin scan-beam passes down the document preview (500ms)
  as the JSON assembles; parse time shown in mono as a lab reading.
- **API key reveal:** un-redacts with a left→right character resolve (300ms), auto
  re-redacts after 20s (countdown ring on the copy button).
- **Usage meter:** a burette-style vertical gauge fills with the month's pages,
  tier marks etched at thresholds.
- **Touch:** ≥44px targets; tap-for-provenance (no hover dependency); copy buttons
  on every code block and JSON well; swipe between playground sample docs (chips
  are the equivalent).

## 6. Key screens (mobile-first)
1. **Marketing hero:** a curl command and three-line quickstart typeset large —
   code as hero copy — then the honest-accuracy section showing a number we *lose*
   on.
2. **Playground (money screen):** stacked input/output on mobile, split on desktop;
   schema picker chips; a "copy as code" flyout with the equivalent Python/Node call.
3. **Docs:** paper theme, ~65ch, run-it-live cells wired to the playground, response
   schemas in the reagent palette.
4. **Dashboard:** carbon; API keys, burette usage gauge, per-doc-type accuracy
   sparklines, webhook delivery log with signed-payload badges.

## 7. Reduced-motion & fallback
Desktop dissolve → static before/after split with provenance boxes pre-drawn.
Playground docking/scan-beam → JSON fades in complete; provenance highlighting
retained without stroke animation (instant box). Key reveal → plain show/hide.
Errors are full JSON objects, typeset as carefully as success.
