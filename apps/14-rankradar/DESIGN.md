# RankRadar — Design Specification

## 1. Vision
RankRadar answers three weekly questions for small SEO teams: where do we rank,
what should we write next, and what does the client report say. It's a calm,
instrument-grade console — dark slate, tabular numerals, delta glyphs read like
gauge readings — that makes an agency feel better-equipped than the client's other
vendors. Serious, legible, quiet.

## 2. Mobile layout (390×844)
Agencies check movement between meetings and on the client's couch. The phone is a
first-class read-and-alert surface.

- **Nav:** a **bottom tab bar** — Overview · Keywords · Briefs · Reports (4 tabs).
  A project switcher sits in the top bar.
- **Overview:** a summary strip of instrument tiles (keywords tracked, movers up,
  movers down, page-1 count) in tabular mono, then the **movers feed** — the day's
  biggest changes as rows, each with keyword, position, and a delta glyph. The
  primary action, **Generate brief** or **Share report**, is a filled radar-green
  button in the thumb zone.
- **Keywords:** a dense rank list — keyword / position / Δ / best URL. Wide columns
  (volume, SERP-feature chips) live in a horizontally **scrollable** table inside
  its own `overflow-x:auto` container; the page body never scrolls sideways. Tap a
  row for a full-screen detail with a position sparkline.
- **Filters / alert thresholds / brief options:** bottom **sheets**.
- Body ≥16px; numerals tabular and right-aligned; rows ≥48px.

## 3. Identity
| Role | Name | Hex |
|---|---|---|
| Base | Console slate | `#0E141B` |
| Panel | Panel slate | `#161F29` |
| Brand | Radar green | `#4ADE80` |
| Rising | Signal cyan | `#38BDF8` |
| Falling | Threat amber | `#F59E0B` |
| Text | `#E2E8F0` / muted `#8A99A8` |

- **Display & UI:** `Geist` (fallback `Inter`). **Positions, deltas, volumes:**
  `Geist Mono` tabular — a position number is an instrument reading.
- **Delta glyphs:** ▲ cyan (up), ▼ amber (down), ● gray (steady) — custom-drawn,
  optically centered beside the mono numerals. This glyph set is the core visual
  language.
- **Signature detail — the delta reveal.** When positions refresh, each changed
  numeral rolls (odometer, `dur-standard`) as its delta glyph strokes in; a new
  page-1 entry emits a single quiet radar-green ring from its row (600ms, one ring
  only). No sweeping WebGL scope on the phone — just legible, instant "what moved."

## 4. Responsive
Mobile is the read/alert surface; **desktop is the operator console.** On
lg screens the layout becomes the full instrument panel: the rank table dominant,
a movers rail on the right, summary tiles across the top. **Optional desktop-only
enhancement:** a circular radar scope — keywords as blips at radius = distance from
#1, a slow phosphor-decay beam — as a *filterable* visualization of the tracked
set. Lazy-loaded behind a static plotted-scope poster, pointer-only, never in the
mobile bundle. The scope is enrichment; the table is the truth on every screen.

## 5. Motion & touch
- Shared tokens: row re-sort uses `spring-gentle` FLIP moves; numerals
  `dur-standard`; chips `spring-snappy`.
- **Daily refresh:** a single 2px radar-green scanline passes down the table
  (800ms) and rows re-sort behind it — one clean pass, not a light show.
- **SERP-feature chips** (AI Overview, snippet, local pack): flip in when gained,
  desaturate when lost.
- **Brief generation:** the keyword header brackets ⌜⌝ (200ms), then the brief
  assembles section-by-section — outline lines draw, entities populate as chips
  (60ms stagger, ≤8 at once).
- **Touch:** ≥44px targets; swipe a keyword row for quick actions (pin / alert /
  brief — all present as buttons in detail); pull-to-refresh on Overview and
  Keywords.

## 6. Key screens (mobile-first)
1. **Overview:** instrument tiles + movers feed, primary action in the thumb zone.
2. **Keywords (core):** dense rank list, horizontally scrollable wide columns,
   tap-through to a sparkline detail.
3. **Client report (money screen):** switches to a light "print" theme — white,
   slate ink, the agency's logo — because it's *their* artifact, not ours; charts
   simplify, wins lead. Shareable link + scheduled PDF; the theme swap is itself a
   feature demo.
4. **Brief view:** target-locked keyword header, outline, entities/questions as
   chip clouds, internal-link suggestions to tracked pages.

## 7. Reduced-motion & fallback
Scanline refresh → instant table update with a brief row-level green flash.
Odometer → value swap; delta glyph appears without stroke. Sonar ring → a static
badge highlight. Desktop scope → its static plotted poster. All movement is also
carried in the Δ column as text, so nothing depends on animation.
