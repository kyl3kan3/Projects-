# ShotStash — Design Specification

## Vision
A native desktop instrument with one superpower made just visible enough: your
screenshots become searchable text. ShotStash should feel like it shipped with the OS —
platform-faithful chrome, instant response, obsessive spacing — with restraint, not
theater. The wow is retrieval speed and honesty, not spectacle.

## Primary layout (desktop app, Tauri)
Not a phone app — but restraint and responsive small-window behavior are still the spec.
- **Window:** a three-region layout — left rail (collections, tags, app/date filters),
  center virtualized grid (4–8 columns, 8px gutters), right inspector (the selected
  shot's OCR text, selectable, with an optional faint word-box overlay).
- **Global quick-search palette** is the daily gesture: a hotkey summons a floating bar,
  visible <100ms from keypress; results populate per-keystroke with zero animation —
  only *new* result thumbnails fade in 60ms. Perceived latency is the brand.
- **Menu-bar / tray quick look:** clicking the tray icon drops a mini recent-grid; every
  shot in it is already searchable.
- Keyboard-first throughout: hotkey hints in muted mono; the keyboard-selection state and
  pointer-hover state share one visual language (a 2px cyan focus edge).

## Small-window & responsive behavior
Below ~900px the inspector collapses to a toggle (grid reclaims the width); below ~640px
the left rail becomes an icon strip, grid drops to 2–3 columns, and the toolbar collapses
overflow controls into a "…" menu. The quick-search palette is width-fluid and never
clips. Content regions each own their scroll; the window chrome never scrolls sideways.

## Identity
| Role | Name | Hex |
|---|---|---|
| Base (dark) | OS charcoal | `#1B1D21` |
| Material | Translucent panel | vibrancy / `#26292F` @88% |
| Brand | Scan cyan | `#3EE0F0` |
| OCR glow | Ice | `#BFF6FB` |
| Match | Highlight yellow | `#FFD84D` |
| Text | Bright / muted | `#ECEEF2` / `#8E96A3` |

Light mode mirrors the system.

- **UI:** system stack (SF Pro / Segoe UI / Inter on Linux) — native faithfulness beats
  brand vanity in a utility. **Data:** `JetBrains Mono` for search queries and OCR text.
- **Signature detail — the honest match highlight:** search is the hero, so the signature
  is retrieval made visible, not the capture animation. Matched words light up yellow
  *in-image* using the real OCR bounding boxes; opening a result zooms to the first match
  with a single highlight pulse; Enter cycles matches inside a shot. On capture, a brief
  cyan scan sweep (one pass, ~300ms, no additive-glow wall) marks that indexing ran —
  restrained, and it renders from actual word geometry, so it never over-claims.

## Responsive / progressive enhancement
Platform-first materials: real vibrancy on macOS, Mica on Windows, a flat charcoal
equivalent on Linux — our identity lives in the cyan accent, the yellow match marks, and
spacing, not custom chrome. No 3D anywhere. Bulk import shows a calm progress counter
("indexed 1,148 / 4,182") rather than a mesmerizing beam wall — honesty over hypnosis.

## Motion & touch
- Shared tokens: palette drop-in `spring-snappy` at 8px; capture thumbnail flies to the
  corner with `ease-out-quart`; match-to-match camera pans `ease-in-out-soft` at
  `dur-emphasis`. All latency budgets are unchanged by motion — speed is accessibility.
- Capture flow: hotkey → dim overlay + crosshair with live 1px cyan edges and mono
  dimensions; release fires a 120ms border-only shutter flash (never full-screen).
- Targets ≥32px for a dense desktop tool, but all primary buttons and menu rows ≥40px.
- Drag a shot onto a collection: the chip inhales (scale 1.06) and the shot deals in.

## Key screens
1. **Library (core):** toolbar (search, filters), virtualized grid, right inspector with
   selectable OCR text — seeing your screenshot as text is the quiet second wow.
2. **Search results (money screen):** query bar with token chips
   (`app:figma before:march "api key"`); every thumbnail shows its yellow match marks.
3. **Onboarding:** one screen — "Point me at your screenshot folders" → folder pick →
   import begins immediately with a calm counter. The wow *is* the onboarding.
4. **Marketing page:** a faithful app-window screen recording (not WebGL — authenticity
   sells utilities), the search demo with in-image matches, and a mono privacy strip:
   "OCR on-device. Index on-device. Nothing leaves."

## Component language
- Buttons: native styling per platform; primary actions get the cyan tint.
- Thumbnails: 6px radius, 1px hairline; hover/selection raises a 2px cyan edge.
- Toasts: bottom-right, mono, self-dismissing; each includes the relevant hotkey hint.
- Empty state: an empty frame with a resting beam — "Take a screenshot — ⇧⌘5 anytime."

## Reduced-motion & fallback
Scan sweep → thumbnails simply gain a small "indexed" tick; import shows the counter
only. Shutter flash off. Match-to-match pans → instant jumps with the highlight. Palette
drop-in → appear. Speed budgets never change.
