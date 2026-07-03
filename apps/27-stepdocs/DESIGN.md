# StepDocs — Design Specification (v3, redline level)

## Vision
StepDocs turns a messy screen recording into a calm numbered guide, and that
guide is mostly *read* on a phone — someone following along on mobile while
doing the task on another screen. The viewer is the product: crisp typeset
instructions on field white, ink buttons, one blueprint blue rationed to the
step numerals and the pulse ring, and nothing decorative anywhere.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `field` | `#FCFDFF` | The ground. Every screen |
| `panel` | `#F3F5F9` | Screenshot mats, sheets, code blocks only |
| `hairline` | `#E4E8EF` | 1px dividers & frame borders — never darker |
| `ink` | `#111827` | Primary text; **primary buttons** (field text) |
| `ink-2` | `#6B7280` | Secondary text |
| `ink-3` | `#9AA1AC` | Faint (timestamps, footer badge) |
| `blueprint` | `#2E62C9` | THE accent. ≤10% of any screen: step numerals, pulse ring, progress spine, links, active states |
| `green` | `#16A34A` | Checked-off steps / fresh guides only |
| `amber` | `#D97706` | Stale-guide flags / warnings only |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: `ink` is the only high-emphasis fill; `blueprint` never fills a
button or a surface — it lives in the numeral circles, the ring, the spine, and
links, nowhere else. Redaction frost is `rgba(148,163,184,.55)` + blur 8.

## Type — exact specimen

One family, wielded with discipline: **Inter** (400/500/600/700) for everything
· **JetBrains Mono** (500) for data. Both self-hosted woff2, preloaded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Guide title | Inter 700 | 28 / 1.15 | −0.01em |
| H2 (section) | Inter 700 | 20 / 1.2 | 0 |
| Step instruction | Inter 600 | 16 / 1.4 | 0 |
| Body / note | Inter 400 | 16 / 1.55 | 0 |
| Secondary | Inter 400 | 13 / 1.45 | 0 |
| Label | Inter 600 | 11 / 1.2 | +0.08em, uppercase |
| Data (meta, durations) | JetBrains Mono 500 | 13 / 1.2 | 0, tabular figures |
| Step numeral | Inter 700 | 15 / 1 | 0, in the 28px circle |
| Button | Inter 600 | 15 / 1 | 0 |

UI element names inside instructions render 600 ("Click **Save invoice** in
the top right"). Guide meta prints mono (`12 STEPS · 4 MIN · UPDATED JUN 30`).

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **8** (buttons, inputs, chips) · **12** (screenshot frames, code
  blocks) · **20** (sheets). Nothing else. Step circles are the one true circle.
- Elevation: none. Screenshots sit in hairline frames on `panel` mats; depth is
  hairlines and spacing. The share sheet alone has a scrim.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `list-checks` (checklist), `play` (replay), `share`,
`chevron-left`, `check`, `shield` (redaction), `pencil`, `trash`,
`arrow-up-down` (reorder), `merge` (two-into-one), `blur-drop`, `download`,
`folder` (spaces), `alert-flag` (stale). Nav at 22px, inline at 18px. **No
emoji, anywhere, ever** — warnings are an `alert-flag` glyph + amber Label,
never a warning-sign emoji.

## Component construction (exact)

- **Primary button:** `ink` fill, `field` text, radius 8, height 48 (full-width
  in bottom bar). Press: scale 0.98 + fill `#252D3D`. Disabled: `#E4E8EF` fill,
  `ink-3` text.
- **Secondary:** transparent, 1px hairline, `ink` text. Press: border `#CBD2DD`.
- **Quiet action:** text-only `blueprint`, no underline; press dims to 80%.
- **Step block (viewer):** NOT a card. Full-width, hairline divider between
  steps, 24px vertical padding: 28px `blueprint` circle with white numeral,
  instruction 16/600 beside it, optional note in Body, then the screenshot in a
  hairline frame (radius 12) on a `panel` mat with 12px padding. Wide captures
  scroll inside their own `overflow-x:auto` frame.
- **Pulse ring:** fixed geometry everywhere — outer ring 28px/1.75px stroke at
  50% `blueprint`, inner ring 14px/1.75px at 100%, centered on the recorded
  click point.
- **Progress spine:** 2px `hairline` line down the left gutter, filling
  `blueprint` top-to-bottom with scroll position; step circles sit on it.
- **Checklist mode:** each step gains a 44px `check` control right-aligned;
  checked = circle fills `green`, white check glyph, instruction stays `ink`
  (never struck through); auto-scroll to next.
- **Bottom action bar (viewer):** height 56 + safe-area, `field` 94% + blur,
  hairline top: `list-checks` toggle, step position in mono (`STEP 4 OF 12`),
  `play` Replay.
- **Redaction region:** frost fill + 14px `shield` glyph centered + `REDACTED`
  Label — shown proudly, never a black bar.
- **Guide cards (library):** cards allowed (framed objects): hairline border,
  radius 12, padding 16 — first screenshot thumb, Title 16, mono meta, freshness
  dot 6px (`green` fresh → `amber` flagged). Footer badge in viewer: 11px
  `ink-3` "Made with StepDocs" — small and self-respecting.

## The signature — the pulse ring + paced Replay
Every screenshot marks its interaction point with the two-ring blueprint
target. Pressing Replay advances step by step: each step slides in 24px
horizontally (200ms `ease-out-quart`), then the pulse ring blooms once —
inner ring scales 0.6→1 and outer ring 1→1.4 fading 100%→0 over 600ms
`ease-out-quart` — then a 1.2s hold before auto-advance. Tap anywhere to
pause; swipe or arrows to step manually. Pure CSS transform + opacity, 60fps
on any phone — no canvas ghost cursor on mobile. This is the entire brand
animation.

## Mobile layout (390 × 844 — primary spec)
- **Guide viewer (the artifact):** slim top bar (back, truncating title,
  `share`). Title block: "How to issue a refund in Stripe" 28/700, mono meta
  (`12 STEPS · 4 MIN · DANA WHITFIELD · UPDATED JUN 30`), author avatar 24px.
  Then the step stream on the spine — Step 1 "Open the **Payments** page from
  the left sidebar", Step 2 "Click the payment row for **inv_1KX9 — $240.00**",
  each with its framed screenshot and pulse ring. Bottom action bar as specced.
- **Share sheet:** radius 20 top, 40×4 grab handle in `hairline`, padding 20:
  link row with `copy`, visibility Labels (PUBLIC · WORKSPACE · UNLISTED),
  PDF/Markdown export rows — hairline rows, not boxes.
- **Library:** search input, space tabs (Support · IT · Onboarding) as chips,
  then guide cards 1-up; stale guides show the amber dot + "UI changed?" flag
  row.
- **Marketing hero:** a real guide Replay playing in a phone frame; beneath,
  Record → It writes itself → Share as three numbered circles on a spine that
  draws on scroll; then an honest hairline spec table vs Scribe ($12 vs $23+).

## Responsive
≥1024px: viewer gains a sticky step-list rail left and a ~68ch measure. The
desktop **editor** is its own pointer/keyboard surface: step cards on a spine,
screenshot canvas with draggable ring re-crop, brand controls in a top bar.
Optional desktop enhancement: smooth ghost-cursor Replay (canvas, spring paths
along real recorded coordinates) — lazy, desktop-only; mobile keeps the paced
ring-bloom version, which is complete.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Editor reorder: drag cards (`spring-gentle`),
spine re-numbers in a 60ms cascade; up/down buttons equivalent. Merge plays a
180ms card-shuffle. Redactions frost in one-by-one (120ms) at author time.
Checklist check draws in 200ms with auto-scroll (`ease-in-out-soft`, 320ms).
Targets ≥44px; swipe left/right between steps in Replay with prev/next buttons
always present.

## Reduced motion & fallback
Replay → manual advance, rings statically placed at their real positions.
Slide, bloom, cascade, frost animation → instant. Checklist auto-scroll → jump.
Spine fills without transition. All motion collapses to ≤100ms opacity;
nothing is motion-only.
