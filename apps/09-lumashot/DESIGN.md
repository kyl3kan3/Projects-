# LumaShot — Design Specification (v3, redline level)

## Vision
One transformation: your camera roll becomes a studio headshot in under 30
minutes. The interface is a darkened studio — cyc black, softbox-white
actions, a single champagne key light rationed to the moments that earn it.
Photography carries every screen; the UI is the grip crew, not the talent.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `cyc` | `#0A0A0C` | The ground. Every screen. |
| `studio` | `#161618` | Sheets, pack panels, status card only |
| `hairline` | `#26262A` | 1px dividers & panel borders — never brighter |
| `text` | `#F2F0EC` | Primary text (softbox white) |
| `text-2` | `#95918A` | Secondary text (ash) |
| `text-3` | `#5C5A55` | Faint (timestamps, placeholders) |
| `paper` | `#F2F0EC` | **Primary buttons** (cyc text on it) — softbox doubles as paper |
| `champagne` | `#F4D8A6` | THE accent. ≤10% of any screen: the key-light sweep, active style chip, the logo slash, links, favorite star |
| `green` | `#57B87B` | Upload passed / pack ready only |
| `red` | `#E5604F` | Upload rejected / failed only |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: champagne never fills a button or a surface — the v2
champagne-filled CTA is retired; `paper` (softbox) is the only high-emphasis
fill. Tungsten orange is cut: one accent, rationed. Gradients exist nowhere
except inside the sweep's own mask. Photographs are the only large color.

## Type — exact specimen

Faces: **Playfair Display** (500 italic) for the one editorial line per
screen · **Archivo** (400/500/600) for UI · **IBM Plex Mono** (500) for
counts, ETAs, and the deletion countdown. All self-hosted woff2, preloaded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (editorial line) | PD 500 italic | `clamp(30px, 8vw, 52px)` / 1.15 | 0 |
| H2 (screen title) | Archivo 600 | 22 / 1.2 | −0.01em |
| Title (pack/style name) | Archivo 600 | 16 / 1.3 | 0 |
| Body | Archivo 400 | 16 / 1.55 | 0 |
| Secondary | Archivo 400 | 13 / 1.45 | 0 |
| Label | Archivo 600 | 11 / 1.2 | +0.08em, uppercase |
| Data (counts, ETA, countdown) | IPM 500 | 13 / 1.2 | 0, tabular figures |
| Button | Archivo 600 | 15 / 1 | 0 |

The italic serif appears exactly once per screen; prices and pack counts sit
in Archivo 600, pipeline numbers ("`6 of 8`", "`ETA 14 min`") in IPM.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **10** (controls: buttons, chips) · **14** (pack panels, status
  card) · **18** (sheets). Headshot thumbnails are radius 4 — near-square,
  like prints; the full-screen pager is square-cornered.
- Elevation: none. Depth is `studio` vs `cyc` plus hairlines; only the sheet
  scrim shadows.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `camera`, `upload` (tray + arrow), `grid` (gallery),
`star` (favorite), `crop` (LinkedIn crop), `download`, `zip` (archive),
`trash` (delete now), `clock` (countdown), `check`, `x-reject`,
`chevron-left`, `chevron-right`, `user`, `plus`. Nav renders at 22px, inline
at 18px. **No emoji, anywhere, ever** — a passed upload gets a green `check`
corner tick, not a sparkle.

## Component construction (exact)

- **Primary button:** paper fill, cyc text, radius 10, height 48 mobile
  (full-width in the bottom action bar), Archivo 600 15. Press: scale 0.98 +
  fill `#E4E1DB`. Disabled/unarmed: `#2A2A2E` fill, `text-3` text — the
  upload CTA lives disabled until 8 valid shots, then arms to paper.
- **Secondary:** transparent, 1px hairline, `text`. Press: border `#333338`.
- **Quiet action:** text-only, champagne, no underline; press dims to 80%.
- **Input (email at checkout):** cyc fill, hairline border, radius 10, height
  48, 16px text. Focus: border champagne + 2px offset ring at 25% champagne.
- **Style chips:** height 36, radius 10, hairline, horizontal scroller;
  active = champagne 1px border + champagne text. Each chip opens real
  preview images — never a described-only style.
- **Pack rows:** NO boxes on the landing — three hairline-divided rows ≥64px:
  Title ("Pro"), Secondary ("100 headshots · 5 styles"), price right in
  Archivo 600 20 ("$29"). Selected = 2px champagne left rule. The checkout
  sheet may frame the chosen pack as one `studio` panel (radius 14).
- **Upload grid:** 3-column contact sheet, 4px gaps, thumbs radius 4.
  Validating = 60% opacity; passed = green corner tick (12px, draws 150ms);
  rejected = red corner tick + Secondary reason below ("Face too small —
  move closer"). Sticky bottom counter/CTA: IPM "`6 of 8` minimum".
- **Status card:** the one framed object mid-flow — `studio`, hairline,
  radius 14, padding 16: five stages (UPLOADING → VALIDATING → TRAINING →
  GENERATING → READY) as Label(11) rows with 8px nodes, a slim 2px
  determinate bar tied to real progress, IPM ETA, and the deletion row
  ("Photos auto-delete in `7d` · Delete now" quiet action).
- **Gallery actions sheet:** radius 18 top, 36×4 grab handle, rows ≥56px:
  favorite / LinkedIn crop / download / download all as zip.

## The signature — the key-light sweep (kept, refined)
When a finished headshot lands in the gallery, a soft champagne highlight
sweeps across it once, left→right, 600ms `ease-out-quart`: a 120px-wide
gradient band angled 63° (matching the logo slash), peaking at 14% champagne
over the image, implemented as a pure CSS gradient mask. It plays once per
image on arrival, never on scroll-back. The pack-ready email moment on the
status card is the same sweep across the card, once. That is the entire brand
animation; everything else is state feedback ≤240ms.

## Mobile layout (390×844 — primary spec)
- **Nav:** lightweight top bar (logotype `LUMA/SHOT` left — the slash a thin
  63° champagne beam — account glyph right) + a persistent bottom action bar
  holding the single primary CTA for the current step. No hamburger; the flow
  is linear: Pick pack → Upload → Track → Gallery.
- **Landing:** full-bleed 4:5 hero headshot (real generated example), the
  italic line over it — *"Studio headshots from your camera roll."* — and
  primary **See the styles** in the bottom third. Below: a swipeable
  before/after strip (real pairs, labeled "iPhone selfie → Boardroom style"),
  then the three pack rows, then Label "STYLES" with preview chips.
- **Upload:** contact-sheet grid fills the screen; system picker on tap; a
  collapsible do/don't note ("Vary angles. No sunglasses. One face only.");
  arming counter/CTA pinned bottom.
- **Status:** the status card with live stages, IPM ETA ("`ETA 14 min`"), and
  the visible deletion countdown.
- **Gallery (money screen):** style chips under the top bar, 2-column masonry
  of finished headshots (radius 4, 8px gaps), each arriving with one sweep.
  Tap → full-screen pager (swipe + ‹ › buttons), actions in the bottom sheet.

## Responsive
Mobile is the master. ≥768px: gallery 3 columns, pack rows become a 3-up
band, gutters 32. ≥1024px: upload becomes two panes (contact sheet + live
guidance), the hero grows, max width 1200 — same type scale, same sweep.
**Optional desktop-only enhancement:** a cursor-follow key light on the
marketing hero portrait — pointer-only, lazy-loaded, never on touch devices;
the static lit portrait is complete without it.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Upload thumbs resolve blur→sharp
(`dur-standard`) on validation pass; rejects get the quiet red tick, no
shake. Results deal in with 24ms stagger, ≤8 at once, scale 1.02→1. Progress
is honest: the determinate bar maps to real pipeline state, copy gives a live
ETA — no darkroom theatrics. Targets ≥44px; the CTA bar owns the thumb zone.
Swipe between headshots (visible ‹ › equivalents); pull-to-refresh on
status; long-press to favorite (star button equivalent). Haptics: light tick
on favorite, success notch on Ready; web silent.

## Reduced motion & fallback
Key-light sweep → a single 100ms opacity settle as the image appears.
Blur-to-sharp → instant with the corner tick. Stagger off; headshots appear
together. The determinate progress bar stays — it is information. Cursor
light disabled; static lit portrait shown. Every pipeline state is also plain
text ("Generating · 61 of 100").
