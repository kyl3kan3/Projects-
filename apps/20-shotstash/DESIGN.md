# ShotStash — Design Specification (v3, redline level)

## Vision
A native desktop instrument with one superpower made just visible enough: your
screenshots become searchable text. ShotStash should feel like it shipped with
the OS — platform-faithful chrome, sub-100ms response, obsessive spacing — and
its identity lives in a rationed cyan, honest yellow match marks, and mono
queries, not custom chrome. The wow is retrieval speed.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load. This is a **desktop Tauri app** — the primary
spec is the window, with small-window rules replacing the phone spec.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `charcoal` | `#1B1D21` | Window ground (dark theme) |
| `panel` | `#26292F` | Rail, inspector, palette (at 88% over vibrancy/Mica where available) |
| `hairline` | `#33373F` | 1px dividers, thumbnail borders |
| `text` | `#ECEEF2` | Primary text |
| `text-2` | `#8E96A3` | Secondary text, hotkey hints |
| `text-3` | `#5A616C` | Faint (empty states, disabled) |
| `paper` | `#F2F4F6` | **Primary buttons** (charcoal text on it), key counts |
| `cyan` | `#3EE0F0` | THE accent. ≤10% of any window: focus/selection edge, active filter, capture crosshair, scan sweep, brand mark |
| `match` | `#FFD84D` | Match highlight semantic only — never decoration |
| `green` | `#3ECF8E` | Indexed/success only |
| `red` | `#F26D6D` | Failure only |

Light theme mirrors the system: ground `#F5F6F8`, panel `#FFFFFF`, hairline
`#E2E5EA`, ink `#1B1D21`; primary buttons invert to ink fill + paper text.
Hard rules: cyan never fills a button or a surface; `match` yellow appears
only on real OCR geometry.

## Type — exact specimen

Faces: **platform-native UI** — SF Pro (macOS) / Segoe UI Variable (Windows) /
Ubuntu or Inter (Linux, bundled) · **JetBrains Mono** (400/500, bundled) for
queries, OCR text, and hotkeys. Native faithfulness beats brand vanity here;
the bundled faces are the only downloads.

| Role | Face/weight | Size/lh | Tracking |
|---|---|---|---|
| Window title / H2 | Native 600 | 17 / 1.25 | 0 |
| Section (rail groups) | Native 600 | 11 / 1.2 | +0.08em, uppercase |
| Row / item title | Native 500 | 13 / 1.4 | 0 |
| Body (inspector prose) | Native 400 | 13 / 1.5 | 0 |
| Secondary / hints | Native 400 | 12 / 1.4 | 0 |
| Query / OCR text | JBM 400 | 13 / 1.5 | 0, tabular figures |
| Search tokens / counters | JBM 500 | 12 / 1.2 | 0, tabular figures |
| Button | Native 600 | 13 / 1 | 0 |
| Marketing display | Native/Inter 700 | `clamp(36px, 6vw, 64px)` / 1.05 | −0.02em |

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Grid gutter **8**,
  region padding **16**.
- Radii: **6** (controls, thumbnails, chips) · **10** (palette, tray card,
  inspector cards) · **14** (dialogs). Nothing else.
- Elevation: platform materials do the depth (vibrancy/Mica; flat `panel` on
  Linux). The palette and tray card alone carry
  `0 12px 40px rgba(0,0,0,0.45)`.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `capture` (crosshair), `search`, `folder-watch` (folder +
eye), `tag`, `collection` (stacked frames), `star`, `clock`, `app-window`,
`text-scan` (lines + brackets — OCR), `copy`, `trash`, `settings`, `chevron`,
`check`, `close`, `more` (…). Toolbar 20px, rail 18px, tray 16px. **No emoji,
anywhere, ever** — the tray icon is the brand glyph, monochrome per platform.

## Component construction (exact)
- **Primary button:** paper fill, charcoal text, radius 6, height 32 (40 in
  dialogs/onboarding), native 600 13. Press: fill `#DDE1E7`. Disabled:
  `#33373F` fill, `text-3` text.
- **Secondary:** transparent, 1px hairline, `text`. Hover: `panel` fill.
- **Toolbar search field:** height 32, radius 6, `charcoal` well inside a
  hairline; query text JBM 400 13; token chips (`app:figma`, `before:march`,
  `"api key"`) as 22px-tall mono chips, radius 6, hairline, active = 1px cyan.
- **Left rail (240px):** Label(11) group headers, 28px rows (glyph 18 + name +
  mono count right-aligned), NO boxes — hover is a full-row `panel` wash,
  selection adds a 2px cyan left edge.
- **Grid thumbnails:** radius 6, 1px hairline; hover raises a 2px cyan edge;
  keyboard selection uses the *same* edge (one visual language). Match marks
  render on-thumbnail (below). Virtualized; 4–8 columns, 8px gutters.
- **Inspector (320px):** shot metadata as hairline rows (mono values —
  `2026-06-14 09:32`, `figma.app`, `2.1 MB`), then the full OCR text,
  selectable, JBM 13/1.5, with an optional 1px `cyan` @30% word-box overlay
  toggle.
- **Quick-search palette:** 640×64 input (JBM 15) dropping from screen top,
  radius 10; visible <100ms from hotkey; results grid (max 480px tall) fills
  per keystroke with **zero animation** — only new thumbnails fade in 60ms.
- **Toasts:** bottom-right, `panel`, radius 10, mono body + hotkey hint
  (`Copied OCR text — ⌘⇧C`), self-dismiss 4s.
- Targets: ≥32px everywhere in this dense tool; primary buttons and menu rows
  ≥40px.

## The signature — the honest match highlight
Search made visible from real OCR geometry — it can never over-claim:
- Matched words get boxes from their true bounding rects: fill `#FFD84D` at
  28%, 1px solid `#FFD84D` at 70%, radius 2, inflated 2px.
- Opening a result zooms to the first match — 240ms `ease-in-out-soft` camera —
  then one pulse: box scales 1→1.06→1 in 300ms. `Enter` cycles matches; the
  pan between matches is 320ms `ease-in-out-soft`.
- On capture, a single cyan scan sweep marks that indexing ran: a 1px `cyan`
  edge with a 24px trailing gradient at 12% opacity crosses the thumbnail
  once, ~300ms, `ease-out-quart`. No glow wall, no loop.

## Desktop layout (primary spec)
- **Window:** min 720×480, default 1200×760. Three regions: left rail 240 ·
  center virtualized grid · right inspector 320. Each region owns its scroll;
  the chrome never scrolls sideways.
- **Library:** toolbar 48px (search field, `filter` chips, view toggle, `more`),
  grid below, inspector right. Real content always: thumbnails of a Stripe
  dashboard, a terminal stack trace, a Figma frame — never gray rectangles.
- **Search results (money screen):** query `stripe api key` → mono count
  `41 MATCHES IN 0.04S`, every thumbnail wearing its yellow marks.
- **Onboarding (one screen):** "Point me at your screenshot folders" → folder
  pick → import starts immediately with a calm mono counter
  (`indexed 1,148 / 4,182`) and a green `check` per completed folder. The
  wow *is* the onboarding.
- **Tray quick look:** click drops a 360×420 card (radius 10): mini search
  field + 3×3 recent grid; every shot already searchable.

## Small-window rules
- **<900px wide:** inspector collapses to a toggle (`text-scan` toolbar
  button) that overlays from the right at 320px; grid reclaims the width.
- **<640px:** rail becomes a 48px icon strip (tooltips carry the labels), grid
  drops to 2–3 columns, toolbar overflow collapses into `more`.
- The palette is width-fluid (min 320, max 640, 16px margins) and never clips.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Palette drop-in: `spring-snappy`, 8px travel.
Capture flow: hotkey → dim overlay + crosshair with live 1px cyan edges and
mono dimensions (`1440 × 900`); release fires a 120ms border-only shutter
flash; the thumbnail flies to the corner with `ease-out-quart`, 240ms. Drag a
shot onto a collection: chip scales 1.06 `spring-snappy` and the shot deals
in. Motion never adds latency — speed budgets are unchanged by animation.

## Reduced motion & fallback
Scan sweep → thumbnails gain a small green `check` "indexed" tick. Shutter
flash off. Match pans → instant jumps, marks static. Palette → appears in
place. Pulse → none; the first match box simply renders selected. Import shows
the counter only. Speed budgets never change.
