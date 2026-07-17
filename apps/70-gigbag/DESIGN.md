# GigBag Design — "The Green Room"

Art direction anchored in the product's world: the green room ten
minutes before doors — warm near-black, a strip of marquee light under
the door, gaff tape and setlists on the wall. Dark, warm, roadworthy:
big legible times and keys (read at a music stand in bad light), one
reverb-teal accent, poster-serif display for gig titles. Zero
music-app cliché — no waveforms, no neon EQ bars.

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

## Palette

| Token | Hex | Use |
|---|---|---|
| `greenroom` | `#161412` | App ground (warm near-black) |
| `case` | `#1F1C19` | Cards, sheets (road-case felt) |
| `line` | `#2E2A25` | Hairlines only |
| `houselight` | `#F2EDE2` | Primary text; primary button fill |
| `dim` | `#A29B8E` | Secondary text |
| `faint` | `#6A645A` | Tertiary, disabled |
| `reverb` | `#3E8C8C` | THE accent: confirmed states, active set, focus (≤10%) |
| `brasslamp` | `#C29B4A` | Semantic: holds / pending deposits only |
| `redlight` | `#B34A3C` | Semantic: conflicts / cancellations only |

Hard rules: `reverb` never fills a button or a surface; `houselight`
is the only high-emphasis fill (greenroom text on it). The calendar's
conflict warning is the one `redlight` moment — it should feel like
the recording light. Dark-only: the product lives at night.

## Type — exact specimen

Faces: **Fraunces** (600 — gig-poster serif for titles and the
landing) · **Inter** (400/500) for UI · **IBM Plex Mono** (500) for
times, keys, BPM, and money. All bundled as app assets (expo-font),
loaded before first paint; web self-hosts woff2.

| Role | Face/weight | Size/lh | Notes |
|---|---|---|---|
| Gig title / display | Fraunces 600 | 28/34 | -0.005em |
| H2 | Fraunces 600 | 22/28 | |
| Title (rows) | Inter 500 | 16/22 | |
| Body | Inter 400 | 16/24 | |
| Secondary | Inter 400 | 13/18 | `dim` |
| Placard (status) | Inter 500 | 11/14 | +0.08em, uppercase |
| Mono (times/keys/money) | Plex Mono 500 | 14–16 | tabular-nums |
| Music-stand view | Inter 600 | 22–28 | huge, houselight on black |

## Space, radii, hairlines

4px scale. Radii: 12 (cards), 8 (inputs/chips), 4 (calendar cells) —
three. 1px `line` hairlines. Touch targets ≥ 48px; the pipeline's
status advance is a 56px action.

## Signature detail — the marquee strip

Each gig card carries a thin bottom strip — the marquee light under
the door: `faint` for inquiry, `brasslamp` for hold, `reverb` for
confirmed, doubled (two 2px lines) for paid. The calendar renders the
same strips in miniature; the pipeline is readable as a wall of
light strips. The landing device animates one card's strip through
all four states.

## Motion

One signature: **the strip light-up** — status advances sweep the
strip left to right (180ms ease-out-quart); `paid` doubles the line
with a 120ms settle. The setlist builder's total time counts as songs
drop (120ms per settle). Everything else 120–160ms. Reduced motion:
instant states.

## Screens (MVP)

1. **Pipeline (`(tabs)/index`)** — gig cards by status with marquee
   strips; the calendar toggle; conflict warnings inline in
   `redlight` naming the other gig.
2. **Gig sheet (`gig/[id]`)** — the one screen: title in Fraunces,
   times in big mono rows (load-in / soundcheck / downbeat), fee +
   deposit state, lineup chips, setlist + plot attachments, the
   status advance action. Everything a member asks, answered.
3. **Setlists (`(tabs)/setlists`)** — the book (songs with key/BPM/
   duration in mono), the builder (drag to sets, total time live),
   share action.
4. **Music-stand view (web share `/s/[token]`)** — black screen,
   huge houselight type, key + BPM per song, screen-wake; the
   drummer's view from four feet.
5. **Money (`(tabs)/money`)** — per-gig payments and computed split
   lines (each member, rule shown, amount in mono); the settle-up
   aggregate; year totals for tax season.
6. **Stage plots (`plot/[id]`)** — the stage grid builder (drag
   member/amp/monitor/DI items), input list rows, share action.
7. **Paywall (`paywall`)** — free vs Band, the honest sentence
   ("Solo is free forever — Band adds the business layer"),
   RevenueCat purchase + restore.
8. **Booker pages (server, `/g/[token]`)** — light-on-dark gig
   confirmation: details, the contract, signature, deposit. Clean
   enough to forward to a wedding planner.
9. **Web landing (server/)** — green-room world, the four-beat
   device (see README), the conflict receipt, pricing, App Store
   badges. CTA verbatim: "Get GigBag free".

## Empty / loading / error

Empty states name the next action ("Add your first gig — even the
maybe ones; holds beat surprises"). Offline is first-class: sheets
and setlists render from cache with a quiet "cached" mark. Conflict
warnings always name the other gig and its status.
