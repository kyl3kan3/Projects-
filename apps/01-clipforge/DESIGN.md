# ClipForge — Design Specification (v3, redline level)

## Vision
A quiet, precise editing surface in the dark. The product's confidence shows in
typography and restraint — off-white actions on near-black, one safelight accent
rationed to almost nothing, and a single honest signature: clips that *develop*
from grayscale to color as they render. Nothing decorative moves.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `ink` | `#0B0D12` | The ground. Every screen. |
| `raised` | `#12151C` | Sheets, media frames, grouped panels only |
| `hairline` | `#1F242E` | 1px dividers & card borders — never brighter |
| `text` | `#EDEFF4` | Primary text |
| `text-2` | `#9BA3B4` | Secondary text |
| `text-3` | `#5C6470` | Faint (timestamps in lists, placeholders) |
| `paper` | `#F4F5F8` | **Primary buttons** (ink text on it), key numerals |
| `safelight` | `#E8A33D` | THE accent. ≤10% of any screen: brand mark, active states, progress, links, develop-scan edge |
| `green` | `#3ECF8E` | Success/Ready only |
| `red` | `#F26D6D` | Failure only |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world. ClipForge's accent is the darkroom **safelight amber** — the lamp you develop film under.

Hard rules: safelight never fills a button or a surface; `paper` is the only
high-emphasis fill; success/danger appear only where they mean something.

## Type — exact specimen

Faces: **Clash Display** (600) for display · **General Sans** (400/500/600) for
everything else · **JetBrains Mono** (500) for data. All self-hosted/embedded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (hero) | Clash 600 | `clamp(34px, 9vw, 64px)` / 1.05 | −0.02em |
| H2 (screen title) | Clash 600 | 24 / 1.15 | −0.01em |
| Title (card/row) | GS 600 | 16 / 1.3 | 0 |
| Body | GS 400 | 16 / 1.55 | 0 |
| Secondary | GS 400 | 13 / 1.45 | 0 |
| Label | GS 600 | 11 / 1.2 | +0.08em, uppercase |
| Data / timecode | JBM 500 | 13 / 1.2 | 0, tabular figures |
| Button | GS 600 | 15 / 1 | 0 |

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **10** (controls: buttons, inputs, chips) · **14** (panels/cards) ·
  **20** (sheets, media frames). Nothing else.
- Elevation: none. Depth comes from `raised` vs `ink` and hairlines. No shadows
  except the sheet scrim.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, drawn currentColor.
Required glyphs: `film` (projects), `plus`, `user`, `chevron-left`, `refresh`,
`download`, `scissors` (trim), `copy`, `check`, `link`, `upload` (tray + arrow),
`play`. Nav renders at 22px, inline at 18px. **No emoji, anywhere, ever** —
the hook score renders as a mono label chip (`HOOK 94`), not an emoji.

## Component construction (exact)

- **Primary button:** paper fill, ink text, radius 10, height 48 mobile
  (full-width in thumb zone), GS 600 15. Press: scale 0.98 + fill `#E3E6ED`.
  Disabled: `#2A2F3A` fill, `text-3` text.
- **Secondary:** transparent, 1px hairline, text color `text`. Hover/press:
  border `#2A3140`.
- **Quiet action:** text-only, safelight, no underline; press dims to 80%.
- **Input:** ink fill, hairline border, radius 10, height 48, 16px text.
  Focus: border safelight + 2px offset ring at 25% safelight.
- **Chips:** height 36, radius 10 (not pill — pills read generic here), hairline;
  active = safelight 1px border + safelight text. Rows scroll horizontally, no scrollbar.
- **List rows (projects):** NO boxes. Full-bleed rows, 16px vertical padding,
  1px hairline between rows, whole row tappable, ≥56px tall.
- **Cards:** only for media/asset objects. `raised` fill, hairline border, radius 14
  (20 for the video frame inside), padding 16.
- **Stage pill:** hairline pill shape allowed here (status is a special glyph),
  height 28, dot 6px + Label(11) text. Active = safelight dot (2s soft pulse),
  Ready = green dot + one-time 1.4s ring, Failed = red dot.
- **Bottom tab bar:** height 56 + safe-area, `raised` at 94% + blur, hairline top.
  Three items: film / plus / user icons at 22px with 10px GS 600 labels. Center
  action: 48px **circle**, paper fill, ink plus icon, raised −16px. Active item
  icon+label = `text`; inactive = `text-3`; a 2px safelight dot marks the active tab.

## The signature — film-develop (kept, refined)
A clip's poster mounts grayscale at 55% brightness. As the render completes (or
on first reveal) a develop wipe sweeps left→right in 900ms `ease-out-quart`:
ahead of the edge grayscale, behind it full color; the moving edge itself is a
1px safelight line at 60% opacity (the only safelight on the card). Rendering state =
the grayscale poster with a 1.5s traveling sheen at 8% white; label "Developing…"
in `text-3`. This is the entire brand animation. Everything else is state
feedback ≤240ms.

## Mobile layout (390×844 — primary spec)
- **Landing:** gutter 20. Nav row (brand mark + "Log in" quiet action). Display
  headline over two lines, the second line safelight ("A week of content out.").
  Body 16/`text-2`, max 34ch. Primary button full-width 48px; sticky above the
  safe-area after the hero scrolls off. Below: one art-directed 9:16 clip still
  (duotone safelight-on-ink image treatment, caption words set in real type) that
  plays the develop wipe once on scroll into view; then a thread card and
  newsletter card with REAL copy; then pricing as three hairline-divided blocks
  (not boxes), price numerals in `paper`.
- **Dashboard:** top row = brand mark + `3/15` mono quota. One hairline panel:
  plan name + 20-frame quota strip (4×20px frames, filled = safelight 80%).
  "Projects" H2 + quiet "+ New kit". Then full-bleed hairline rows: Title(16),
  mono meta(13 `text-3`), stage pill right. Bottom tab bar.
- **Content kit:** sticky header (ink 92% + blur, hairline bottom): back chevron,
  title, stage pill. Chip row Clips/Written. Clip cards single column: video
  frame radius 20, meta padding 16, aspect + caption chips in scrolling rows,
  then a 2-col grid: secondary "Trim" / primary "Download" (48px). Trim expands
  inline as a raised panel (radius 14). Written assets: cards with an 11px
  uppercase kind label ("TWEET THREAD"), body 16, Edit/Copy quiet actions
  top-right, citations behind a details row with safelight mono timestamps.
- **Sheets (upload/account):** radius 20 top, 40×4 grab handle in `hairline`,
  padding 20, spring in 320ms. Drop target: dashed hairline, radius 14, SVG
  upload icon 24px in `text-2`.

## Responsive
≥768px: kit becomes two columns (clips / written), landing proof cards 3-up,
gutters 32. ≥1024px: dashboard gains a left rail (workspace + quota) replacing
the tab bar; kit adds a third transcript column; max content width 1120 centered.
No desktop-only spectacle — the develop wipe is the signature at every size.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Rows/cards enter with a 12px rise,
`spring-gentle`, 30ms stagger ≤6 items. Copy → label swaps to "Copied" with a
200ms check draw. Sheets spring in 320ms. Stage pill crossfades 200ms. Targets
≥44px; every gesture (pull-to-refresh, sheet swipe-down) has a visible button
equivalent.

## Reduced motion & fallback
Develop wipe → instant color with a 100ms fade (progress still readable as
"Rendering 3 of 6" text). Sheen, pulses, and staggers off. Sheets fade instead
of spring. No information is ever motion-only.
