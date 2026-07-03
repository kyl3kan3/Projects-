# RoomGenius — Design Specification (v3, redline level)

## Vision
Someone stands in their living room, photographs it, and wants to see it better
— right there, on the phone in their hand. RoomGenius is warm plaster and
photography: the room is the interface, chrome recedes, ink buttons sit like
gallery labels, and the one moving part is a before/after reveal that reads as
light crossing the image.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `plaster` | `#F6F1E9` | The ground. Every screen (`#F2F0EC` on Pro) |
| `linen` | `#EFE8DC` | Sheets, swatch cards, grouped panels only |
| `hairline` | `#E2D9CA` | 1px dividers & card borders — never darker |
| `ink` | `#2A2622` | Primary text; **primary buttons** (plaster text) |
| `ink-2` | `#6E655B` | Secondary text |
| `ink-3` | `#9A8F82` | Faint (timestamps, placeholders) |
| `clay` | `#C96F4A` | THE accent. ≤10% of any screen: brand mark, active swatch ring, shop hotspots, links, the reveal edge |
| `sage` | `#6F8455` | Success only (render complete, saved) |
| `rust` | `#B0483A` | Failure only (bad render detected) |

Hard rules: `ink` is the only high-emphasis fill; `clay` never fills a button
or a surface larger than a hotspot dot; photography supplies all other color.
Frosted pills over photos: `rgba(246,241,233,.82)` + blur 12, hairline border.

## Type — exact specimen

Faces: **Fraunces** (SemiBold 600, optical 72) for display · **Inter**
(400/500/600) for UI · **IBM Plex Mono** (500) for data. All self-hosted woff2,
preloaded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (hero) | Fraunces 600 | `clamp(32px, 8.5vw, 56px)` / 1.08 | −0.01em |
| H2 (screen/room title) | Fraunces 600 | 24 / 1.15 | 0 |
| Title (card/row) | Inter 600 | 16 / 1.3 | 0 |
| Body | Inter 400 | 16 / 1.55 | 0 |
| Secondary | Inter 400 | 13 / 1.45 | 0 |
| Label (style names) | Inter 600 | 11 / 1.2 | +0.08em, uppercase |
| Data (prices, counts) | IBM Plex Mono 500 | 13 / 1.2 | 0, tabular figures |
| Button | Inter 600 | 15 / 1 | 0 |

Style names always set as Label: JAPANDI · MID-CENTURY · MODERN FARMHOUSE.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **10** (buttons, inputs, chips, pills) · **14** (swatch/product cards)
  · **20** (sheets, photo frames). Nothing else.
- Elevation: photos and sheets only carry `0 2px 16px rgba(42,38,34,.14)`
  (warm-toned); everything else is flat plaster with hairlines. No linen
  texture overlays — the warmth is in the palette.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `camera`, `image` (rooms), `swatch` (overlapping squares,
styles), `bag` (shop), `briefcase` (pro), `chevron-left`, `download`,
`sliders`, `tag`, `check`, `x`, `stamp` (MLS disclosure), `arrows-lr`
(before/after). Nav renders at 22px, inline at 18px. **No emoji, anywhere,
ever** — room types are Label chips (`LIVING ROOM`), not pictographs.

## Component construction (exact)

- **Primary button:** `ink` fill, `plaster` text, radius 10, height 48
  (full-width in thumb zone). Press: scale 0.98 + fill `#3A352F`. Disabled:
  `#D9D2C6` fill, `ink-3` text.
- **Secondary:** transparent, 1px hairline, `ink` text. Press: border `#CFC5B4`.
- **Quiet action:** text-only `clay`, no underline; press dims to 80%.
- **Style swatch (rail):** 72×92 card, radius 14: photo crop 72×64 on top,
  Label beneath (`JAPANDI`) in `ink-2`. Active = 2px `clay` ring at 2px offset
  + Label turns `ink`. Rail scrolls horizontally, 12px gaps, no scrollbar.
- **Before/after slider:** full-bleed image, radius 20 frame; handle = 44×44
  circle, `plaster` fill, hairline border, `arrows-lr` glyph in `ink`; the
  divider is a 1px `plaster` line at 90% opacity.
- **Shop hotspot:** 12px `clay` dot inside a 44×44 invisible target; tap opens
  the product sheet. A `tag` list-view button shows all items as rows.
- **Product rows (sheet):** NO boxes. Hairline rows ≥64px: 48×48 photo (radius
  10), Title 16 ("Sven Charme Tan Sofa"), mono price (`$1,799`), merchant in
  Secondary ("Article · in stock"), chevron. Sheet: radius 20 top, 40×4 grab
  handle in `hairline`, padding 20.
- **Room cards (home feed):** photo object cards only — image radius 14, meta
  below in 12px padding: Title ("Living room"), mono meta (`6 STYLES · JUN 28`).
- **Bottom tab bar:** height 56 + safe-area, `plaster` at 94% + blur, hairline
  top. Rooms / Styles / Shop / Pro at 22px icons + 10px Inter 600 labels;
  active = `ink` + 2px `clay` dot; inactive = `ink-3`.

## The signature — the light reveal
When a render completes (or first scrolls into view), a wipe crosses the image
left→right in 320ms `ease-out-quart`: ahead of the edge the original photo,
behind it the restyle. The moving edge is a 24px-wide soft mask feathered with
`rgba(232,176,75,.35)` warm light — a pre-composited CSS mask gradient over two
stacked images, 60fps on any phone, no shader. Dragging the slider handle
scrubs the same edge manually. Swatch re-renders replay it at 40% edge opacity.
This is the entire brand animation.

## Mobile layout (390 × 844 — primary spec)
- **Home / upload:** gutter 20. Fraunces greeting ("See it better."), Body in
  `ink-2` max 34ch. Primary button full-width in thumb zone: "Photograph your
  room" with `camera` glyph. Below, recent rooms as photo cards. Empty state: a
  duotone clay-on-plaster line sketch of a sunlit corner + "Show us a room.
  Phone photos are perfect." — no gray box.
- **Reveal (money screen):** photo edge-to-edge under a slim top bar (back,
  "Living room", `download`). `LIVING ROOM` Label chip pinned top-left on the
  image (frosted pill, tap to change). Slider handle centered. Below: the style
  rail (JAPANDI active), then two buttons in the thumb zone — secondary "Save
  look", primary "Shop this room". Shop dots on the sofa, rug, floor lamp.
- **Style picker:** swatch-book grid, 2-up photo cards (radius 14), tap to pin
  up to 5 for a batch; pinned = clay ring + mono count chip (`3 OF 5`).
- **Pro dashboard:** plaster shifts `#F2F0EC`, motion halved. Listing batches
  as contact-sheet rows (hairline, not boxes): address Title ("1427 Maple Ave —
  4 rooms"), per-room status Labels, mono meta. One-press `stamp` action adds
  the `VIRTUALLY STAGED` MLS disclosure Label onto exports; zip export primary.
- **Generation wait (30–60s):** honest and calm — a 1px `ink-2` pencil-line
  sketch of the detected room geometry draws over 8s and loops, chosen swatch
  pinned beside "Reading your room's bones." Real elapsed mono timer. No fake
  progress bar.

## Responsive
≥768px: reveal becomes a centered stage, swatch rail becomes a side swatch
book; gutters 32. ≥1024px: shop sheet docks as a right rail; max content 1120.
Optional desktop enhancement: a subtle 2.5D depth-map parallax on the render
(foreground separates ~10px on cursor move) — pointer-only, lazy-loaded, off on
touch and reduced-motion; the phone reveal is complete without it.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Cards enter with a 12px rise, `spring-gentle`,
30ms stagger ≤6. Swatch selection ring scales in 120ms. Slider tracks the
finger 1:1; handle release settles with `spring-snappy`. Targets ≥44px;
long-press a render to save (visible save button equivalent); light haptic on
render completion (native). Pull-to-refresh on Rooms with a button equivalent.

## Reduced motion & fallback
Light reveal → instant swap with a 100ms fade; slider fully functional. Sketch
wait state → static sketch + text timer. Parallax off. Staggers off. Hotspot
dots static. All motion collapses to ≤100ms opacity; nothing is motion-only.
