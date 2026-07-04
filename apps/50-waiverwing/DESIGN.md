# WaiverWing — Design Specification (v3, redline level)

## Vision
Trailhead signage, not legal wallpaper. WaiverWing is high-contrast, big-type,
readable at arm's length on a scuffed counter tablet — cool granite dark, one
rationed trail-blaze orange, and records set in mono like tags on a gear rack.
The feeling is a well-run outfitter: everything labeled, everything findable,
nothing precious.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `granite` | `#14171A` | The ground. Every screen (cool basalt dark) |
| `slab` | `#1C2126` | Panels: incident files, kiosk attract card, sheets only |
| `hairline` | `#2A3138` | 1px dividers & panel borders — never brighter |
| `text` | `#EEF0EE` | Primary text |
| `text-2` | `#9AA39E` | Secondary text |
| `text-3` | `#616A66` | Faint (timestamps, placeholders) |
| `paper` | `#F4F4F0` | **Primary buttons** (granite text), key numerals |
| `trail` | `#D2703A` | THE accent. ≤10% of any screen: brand mark, the blaze, active states, links, focus rings |
| `pine` | `#55996B` | Current waiver on file / checked in only |
| `ember` | `#C94E42` | Expired / missing waiver / incident-open only |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: `paper` is the only high-emphasis fill; `trail` never fills a
button or a surface — it draws the blaze, rings, and underlines only;
`pine`/`ember` appear only where they mean covered or exposed, kept off any
element carrying `trail`.

## Type — exact specimen

Faces: **Barlow** (400/500/600 + SemiBold 600 for display — a DIN-descended
signage face; the trailhead voice) · **JetBrains Mono** (500) for every date,
count, ID, and hash. Both self-hosted woff2, preloaded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (kiosk attract, counts) | Barlow 600 | `clamp(32px, 8.5vw, 56px)` / 1.08 | −0.01em |
| Kiosk body (waiver text) | Barlow 400 | 18 / 1.6 | 0 |
| H2 (screen title) | Barlow 600 | 22 / 1.2 | −0.01em |
| Title (row) | Barlow 600 | 16 / 1.3 | 0 |
| Body | Barlow 400 | 16 / 1.55 | 0 |
| Secondary | Barlow 400 | 13 / 1.45 | 0 |
| Label | Barlow 600 | 11 / 1.2 | +0.08em, uppercase |
| Data (dates, ids, hashes) | JBM 500 | 13 / 1.2 | 0, tabular figures |
| Button | Barlow 600 | 15 / 1 | 0 |

Kiosk text runs one step larger everywhere (body 18, buttons height 56).
Evidence lines are mono: `SIGNED MAR 2 2026 · 09:41 · KIOSK 1 · SHA-256
4B1E…9C77`.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**
  (kiosk: 32).
- Radii: **8** (buttons, inputs, chips) · **12** (panels, incident cards) ·
  **20** (sheets, kiosk attract card). Nothing else.
- Elevation: none. Depth is `slab` on `granite` plus hairlines; only the
  sheet scrim shadows.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `blaze` (brand/check-in: two stacked chevrons), `people`
(participants), `document-pen` (waivers), `flag` (incidents), `gear`,
`qr`, `search`, `shield-check` (covered), `shield-slash` (expired/missing),
`link` (guardian tie), `download` (PDF), `refresh` (re-sign), `check`,
`plus`, `chevron-right`, `wifi-off`. Nav renders at 22px, inline at 18px;
kiosk at 26px. **No emoji, anywhere, ever** — coverage is a shield glyph
and a pine dot, never a green check mark emoji.

## Component construction (exact)

- **Primary button:** `paper` fill, `granite` text, radius 8, height 48
  mobile / 56 kiosk (full-width in thumb zone). Press: scale 0.98 + fill
  `#E2E2DC`. Disabled: `#262D33` fill, `text-3` text.
- **Secondary:** transparent, 1px hairline, `text`. Press: border `#333B43`.
- **Quiet action:** text-only `trail`, no underline; press dims to 80%.
- **Input:** `granite` fill, hairline border, radius 8, height 48 (kiosk 56),
  16px text (kiosk 18). Focus: border `trail` + 2px offset ring at 25% trail.
- **Search field (check-in):** the screen's hero — height 52, `slab` fill,
  `search` glyph, 18px text; results replace the list as-you-type. Coverage
  pill: height 28, 6px dot + Label(11): pine `ON FILE`, ember `EXPIRED` /
  `NONE`, `text-2` `VISITOR` (single-visit waiver).
- **Participant rows:** NO boxes. Full-bleed rows ≥56px, hairline between:
  Title(16) name (+ `link` glyph and Secondary "guardian: Dana Torres" for
  minors), Secondary last-seen line, coverage pill right. Tap = detail;
  checked-in rows get a pine 6px dot left.
- **Signature block (signing flow):** the waiver text at Body/Kiosk-body in
  its own scroll region (hairline frame — a truly framed object), initialed
  clauses as 44px hairline rows with initials boxes, then the signature
  line: 1px hairline, typed/drawn toggle chips, disclosure sentence in
  Secondary above the sign action.
- **Guardian flow stepper:** Label steps (`GUARDIAN` → `MINORS` → `SIGN`);
  minors added as hairline rows with DOB + relationship; "Add another
  minor" quiet action; the final sign action reads "Sign for Maya and
  Leo" — names, not counts.
- **Incident card:** `slab`, hairline, radius 12, padding 16: mono
  occurred-at, Title, linked-participant rows each with `shield-check` and
  quiet "view waiver" — never nested cards.
- **Kiosk attract screen:** `slab` card radius 20 centered: venue name
  Display, "Tap to sign the waiver" Body, the blaze glyph at 48px in
  `trail` — the only accent on screen; mono sync indicator bottom
  (`SYNCED · 09:41` or `wifi-off` + `3 QUEUED`).
- **Bottom tab bar (staff app):** height 56 + safe-area, `slab` at 94% +
  blur, hairline top: blaze / people / document-pen / flag at 22px + 10px
  Barlow 600 labels; active = `text` + 2px trail dot; inactive = `text-3`.

## The signature — the blaze
On every completed signing and every check-in tap, the blaze draws: two
chevron strokes paint upward in sequence (each 140ms, `ease-out-quart`,
1.75px `trail` stroke), then the confirmation line stamps in beneath —
kiosk: "You're signed in, Maya." / staff row: the pine dot pops 0.9→1 with
`spring-snappy` — and on the kiosk the day counter increments in mono
(`214 SIGNED TODAY`, digits roll once, ≤300ms). Total ≤480ms, pure SVG
stroke-dashoffset + one transform; 60fps on a five-year-old tablet. This is
the entire brand animation; everything else is state feedback ≤240ms.

## Mobile layout (390 × 844 — primary spec)
- **Check-in (staff home):** gutter 20. Top: location switcher + mono day
  stat (`214 SIGNED · 186 IN`). The search field, then today's rows
  (signed, newest first; checked-in with pine dots). Primary button
  **Check in** appears on a selected row in the thumb zone; amber/ember
  rows swap it for **Send re-sign link**.
- **Participant detail:** name + coverage pill, guardian/minor link rows,
  signature history (mono evidence lines), **Export PDF** primary in the
  thumb zone — the lawsuit demo: search → detail → PDF in three taps.
- **Signing flow (`/sign/[token]`, customer phone):** venue wordmark,
  waiver scroll region, clauses, signature, blaze confirmation. One screen
  per step, 16-18px type, no chrome. Works one-handed in a queue.
- **Incidents:** open incidents as cards, closed as hairline history rows;
  new-incident sheet: what/when/where, then linking via the same search.
- **Waiver builder:** block list (text, clauses, questions, signature) as
  hairline rows with config sheets; publish stamps a mono version (`V3 ·
  PUBLISHED JUL 4`); expiry + minor rules as plain-language selects.

## Responsive
≥768px (the kiosk landscape case): signing flow becomes a centered 640px
column; check-in gains columns (channel, expiry date). ≥1024px (front-desk
monitor): left rail replaces tabs; check-in list + participant detail side
by side — search stays the hero; max content width 1200. No desktop
spectacle — the blaze is the signature at every size.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Rows enter with 24ms stagger, opacity + 4px
y-slide. Search results replace via 120ms crossfade — search never bounces.
Kiosk auto-reset: 8s after the blaze, the attract card fades back in over
320ms; any tap cancels. Signing steps slide 200ms `ease-in-out-soft`.
Targets ≥44px staff / ≥56px kiosk, ≥8px apart; deleting or unlinking is
hold-to-confirm (600ms radial fill); pull-to-refresh on check-in. Haptics
native-only, never load-bearing.

## Reduced motion & fallback
The blaze → both chevrons appear complete with a single 100ms opacity fade;
counter roll → direct swap; pine-dot pop → instant; kiosk attract return →
100ms fade; row stagger → ≤100ms opacity. Every state (signed, covered,
expired, queued-offline) is always plain text + pill — the mono sync line
(`3 QUEUED`) is the offline truth regardless of any animation. The signing
flow is server-rendered-first; drawn signatures degrade to typed.
