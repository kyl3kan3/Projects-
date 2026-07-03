# ShotStash — Design Specification

## Design vision
A native desktop instrument with one superpower rendered visible: *light reading
your screenshots*. ShotStash should feel like it shipped with the OS — platform-
faithful chrome, translucent materials, instant response — and then surprise you
with the scan: a beam of light that sweeps a screenshot and leaves searchable
text glowing in its wake. Utility-app humility, flagship-feature theater.

## Brand identity

| Role | Color | Hex |
|---|---|---|
| Base (dark) | OS charcoal | `#1B1D21` |
| Material | Translucent panel | system vibrancy / `#26292F` at 88% |
| Brand | Scan cyan | `#3EE0F0` |
| OCR glow | Ice | `#BFF6FB` |
| Match highlight | `#FFD84D` |
| Text | `#ECEEF2` / muted `#8E96A3` — light mode mirrors system |

- **UI:** system stack (SF Pro / Segoe UI / Inter on Linux) — native faithfulness beats brand vanity in a utility; **search queries & OCR text:** `JetBrains Mono` in overlays.
- **Logo:** a screenshot frame with a diagonal scan-beam crossing it, beam in cyan. Menu-bar icon: monochrome frame-with-beam, template-style.
- **Voice:** terse utility. "4,182 screenshots indexed. 61,204 words findable."

## Art direction
- Platform-first: real vibrancy materials on macOS, Mica on Windows; our identity lives in the cyan beam, the yellow match marks, and obsessive spacing — not custom chrome.
- Screenshots are sacred objects: always pixel-accurate, never cropped decoratively, displayed on a subtle checkerboard when transparent.
- Density: a library grid at 4–8 columns with 8px gutters; keyboard-first affordances visible (hotkey hints in muted mono throughout).

## The signature moment — "The Beam"
On every capture (and during bulk import), the **OCR scan is staged as light**:
the new screenshot's thumbnail appears, then a cyan beam sweeps it diagonally
(63°, 400ms, additive glow), and *the words it passes ignite* — each detected
word's bounding box flashes ice-white for 80ms then fades, leaving a faint
1-frame afterglow trail. During bulk import this becomes a mesmerizing wall:
the grid fills as beams sweep thumbnail after thumbnail (max 3 concurrent beams,
queued), a mono counter climbing ("indexed 1,148 / 4,182 · 380 words/sec").
Search completes the theater in reverse: matched words in results **light up
yellow in-image** (the real bounding boxes from OCR data), and opening a result
zooms to the first match with the highlight pulsing once. The beam is honest —
it renders from actual OCR word geometry, not decoration.

## Motion system
- **Quick-search palette (the daily gesture):** hotkey summons a floating bar that drops in 8px with `spring-snappy` (target: visible <100ms from keypress — perceived latency is the brand); results populate per-keystroke with 0ms animation (instant), only *new* result thumbnails fade in 60ms.
- **Capture flow:** hotkey → dim overlay + crosshair; the selection rectangle has live 1px cyan edges with mono dimensions ticking beside the cursor; release fires a 120ms white shutter-edge flash (border only, not full-screen) and the shot flies to the corner as a thumbnail (450ms `ease-out-expo` with scale-down) where the Beam scans it.
- **Annotation:** tools apply with zero latency; the blur tool shows a live frosted preview under the brush.
- **Tag/collection filing:** dragging a shot onto a collection makes the collection chip inhale slightly (scale 1.06) and the shot deals into it.
- **Menu-bar quick look:** clicking the tray icon drops a mini recent-grid (200ms) — every shot in it already searchable.

## Key screens
1. **Marketing page:** a faithful app-window mockup running the bulk-import Beam wall as the hero (screen recording, not WebGL — authenticity sells utilities); beneath, the search demo with in-image yellow matches; a privacy strip in mono: "OCR on-device. Index on-device. Nothing leaves."
2. **Library (core):** toolbar (search, filters by app/date/tag), virtualized grid, right inspector with the shot's OCR text selectable (mono, faint word-box overlay toggle) — seeing your screenshot as text is a quiet second wow.
3. **Money screen — Search results:** query bar with token chips (`app:figma before:march "api key"`), results grid where every thumbnail shows its yellow match marks; hit Enter to cycle matches inside a shot with camera pans (300ms `ease-in-out-soft`).
4. **Onboarding:** one screen: "Point me at your screenshot folders." → folder pick → the import Beam wall begins immediately — the wow *is* the onboarding.

## Component language
- Buttons: native styling per platform; primary actions get the cyan tint.
- Cards/thumbnails: 6px radius, 1px hairline, hover raises a 2px cyan focus edge (also the keyboard-selection state — pointer and keyboard share one visual language).
- Empty state: an empty frame with a resting beam: "Take a screenshot — ⇧⌘5 anytime."
- Toasts: bottom-right, mono, self-dismissing; every toast includes the relevant hotkey hint.

## Reduced motion & fallback
Beam → thumbnails simply gain a small "indexed" tick; import shows the counter only. Shutter flash off. Camera pans between matches → instant jumps with highlight. Palette drop-in → appear. All latency budgets unchanged (speed is accessibility too).
