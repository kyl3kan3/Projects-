# ResumeRocket — Design Specification

## Vision
A job search runs on a phone between other obligations, so ResumeRocket turns
application anxiety into calm instrumentation: paste a posting, see the gap, close
it. The signature is honesty made visible — an ATS X-ray that shows what the robot
actually reads, legible on a 390px screen, not a spectacle.

## Mobile layout (390 × 844)
- **Nav:** compact top bar — back chevron, the current application's title (company ·
  role, truncating), and a match-score pill on the right that stays pinned. Primary
  navigation (Applications · Tailor · Documents · Tracker) is a bottom tab bar,
  thumb-reachable, clearing the home indicator.
- **Hero (Tailor screen):** a single vertical stack, no side-by-side panels. Top: the
  **match dial** as a slim horizontal meter with its number in large data type. Below
  it, a segmented control — **Resume view / X-ray view** — one tap flips the document
  between the human render and the machine render (this replaces any sweeping
  animation). Under that, the gap list scrolls: covered / partial / missing keyword
  chips grouped by status.
- **Primary action:** a full-width **Apply-ready** / **Tailor now** button fixed in the
  bottom third above the tab bar, in thrust blue; it reflects state (disabled-quiet
  until a posting is loaded, solid when actionable).
- **Key components at phone width:** the resume renders as bright paper edge-to-edge
  with 16px margins; suggestion bullets appear as full-width cards you accept with a
  44px checkmark; the posting is pasted via a bottom sheet, not a second column.

## Identity
| Role | Name | Hex |
|---|---|---|
| Control indigo (app chrome) | `#141A3B` |
| Panel | `#1C2450` |
| Thrust blue (brand/CTA) | `#4F6DF5` |
| Match green | `#3DDC97` |
| Gap amber (unverified + missing) | `#FFC24D` |
| Paper / document ink | `#FCFCFA` / `#1A1D29` |

Text `#EAEDF9`, muted `#8B93BC`.

- **Type:** display **Archivo** (condensed 700) for scores and screen titles — a quiet
  launch-poster note; **Inter** for UI/body (≥16px mobile); resume body offers three
  ATS-safe suites (**Source Serif 4** classic, **Inter** modern, **IBM Plex Sans**
  compact). Keywords and scores set in **IBM Plex Mono**.
- **Signature detail — the X-ray flip:** the segmented control cross-dissolves the paper
  into its parsed skeleton (200ms, `dur-standard`): readable fields (name, dates,
  titles) snap into labeled outline boxes in thrust blue; anything the parser drops
  (multi-column, tables, icons) desaturates to flat gray with a "not read" tag. It is
  a state toggle, not a cinematic sweep — instant, honest, replayable, 60fps on any
  phone because it is opacity + color, no canvas.
- **Honesty layer:** AI-suggested text the user hasn't confirmed carries a dashed amber
  underline and a confirm control; nothing dashed can export.

## Responsive
Single column is the design; on `md`+ the Tailor screen splits into posting (left) ·
document (center) · gap rail (right), and the segmented X-ray toggle becomes a
side-by-side human/machine pair. The match dial grows from meter to circular gauge.
**Optional desktop enhancement:** a larger annotated X-ray inspector with hover
tooltips per parsed field — lazy, pointer-only, never on the mobile path.

## Motion & touch
- Match dial animates only on real change (`spring-gentle`); rest position is honest,
  never a fake 90.
- Chip extraction from a pasted posting: keywords file into covered/partial/missing at
  a calm 80ms cadence, capped at 8 visible before batching.
- Targets ≥44px, ≥8px apart. Accepting a suggestion is a large checkmark; **swipe-left
  on a suggestion card** to dismiss, with a visible dismiss button as equivalent.
- Export confirmation gives a light haptic tap on native.

## Key screens
1. **Free ATS X-ray (funnel):** drop a resume → the flip reveals the machine view →
   three findings free, rest behind signup. Marketing-tier polish; the shareable result
   card is a phone screenshot by design.
2. **Tailor workspace (money screen):** the stacked layout above; reaching all-clear
   fires a single quiet green readiness band across the dial — never confetti.
3. **Document editor:** paper-first, section reorder via long-press drag (`spring-gentle`)
   with up/down buttons as equivalent; a fuel-gauge pagination chip shows 1-page / 2-page.
4. **Tracker:** applications as a vertical list with mini match meters and a status
   segment (applied · interview · offer); a weekly cadence line at top.

## Reduced-motion & fallback
X-ray flip → instant swap, no dissolve. Chip filing → chips appear pre-docked with a
count. Dial → set value, no wind. Suggestion underline stays (it is information). All
motion collapses to ≤100ms opacity.
