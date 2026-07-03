# ClipForge — Design Specification

## Vision
One upload in, a week of content out — and the app should feel as fast as that
promise. A dark, focused editing surface where processing is legible at a glance
and every generated asset is one thumb-tap from copied or downloaded. Confident
and quiet, not a trailer-house spectacle.

## Mobile layout (390 × 844 — the primary spec)
Creators check on a rendering episode from their phone between other things, so the
phone is the real product surface.

- **Nav:** bottom tab bar, 4 items — Projects · Upload · Assets · Account — 56px
  tall, icons + labels, sitting above `env(safe-area-inset-bottom)`. The center
  **Upload** action is the visual anchor.
- **Landing / marketing** (logged-out): single column. Headline set large
  ("One upload in. A week of content out."), a 20s muted autoplay clip of a real
  content kit (poster-first, `<video playsinline>`), then a vertical stack of three
  proof cards — a 9:16 clip, a tweet thread, a newsletter block. CTA pinned as a
  sticky bottom button once the hero scrolls off.
- **Project screen** (the workhorse): a sticky top bar shows episode title + a slim
  **stage pill** (Queued → Transcribing → Selecting → Rendering → Ready). Below, the
  content kit is a single scrolling column of asset cards. No side rails on phone.
- **Primary action** lives in the bottom third: a full-width **Copy** / **Download**
  button per asset card, and a persistent "Share kit" bar when a project is Ready.
- **Key components at phone width:** clip card (9:16 thumbnail, tap-to-play sheet,
  caption-style chips that horizontally scroll); written-asset card (thread /
  LinkedIn / newsletter with a "source quote" line and inline edit); upload card
  (drag-drop collapses to a big tap target + "Import from URL").

## Identity
| Role | Hex |
|---|---|
| Ink (base) | `#0B0F17` |
| Panel | `#121826` |
| Brand violet | `#6D5EFC` |
| Brand hot | `#A78BFA` |
| Signal cyan | `#22D3EE` |
| Text | `#E8ECF6` / muted `#8B97B3` |

- **Display:** `Clash Display` semibold, -2% tracking — title-card headlines.
- **Text:** `Inter`, 16px min on mobile. **Data/mono:** `JetBrains Mono` for every
  timecode, with tabular figures.
- **Signature detail — the film-develop reveal.** A clip thumbnail resolves from
  grayscale to color with a left-to-right wipe tied to *actual* render progress —
  so the image literally develops as the render completes. Pure CSS mask transition,
  cheap, reads perfectly at 60fps on a phone. No 3D, no full-screen scene; the whole
  brand personality lives in this one honest progress cue.

## Responsive
Mobile's single column becomes a two-column kit view on tablet (≥768px: clips lane
+ words lane) and a three-lane light table on desktop (≥1024px: clips · words · a
scroll-spy transcript with chosen ranges highlighted in violet). The dashboard gains
a left workspace rail only at ≥1024px; below that it's the bottom tab bar.
**Optional desktop-only enhancement:** a subtle parallax on the marketing proof cards
via CSS scroll-driven animation. No WebGL anywhere; the hero video carries it.

## Motion & touch
- Uses shared tokens. Stage pill morphs between states with `ease-in-out-soft` /
  `dur-standard`; a completed stage fires one 6px cyan pulse ring (`dur-emphasis`,
  opacity 0.4→0) — not a loop.
- Asset cards enter with `spring-gentle`, staggered 30ms, ≤8 at once, rising ≤16px.
- Copy button: press scales 0.96 (`dur-micro`); on success the label swaps to
  "Copied" with a cyan check drawing in 200ms.
- **Touch:** all targets ≥44px; asset action buttons are full-width in the thumb zone.
- **Gestures:** swipe a written-asset card left to reveal Regenerate/Delete (also in
  an overflow menu); pull-to-refresh on the project screen re-polls status (also a
  visible refresh control in the top bar). Haptics are web-only light taps where the
  Vibration API is available; never required.

## Key screens (mobile-first)
1. **Project / kit view:** sticky title + stage pill; scrolling column of clip and
   written-asset cards; Ready state pins a "Share kit" bar bottom.
2. **Upload:** big tap target with drag-drop fallback, URL import field, per-tier
   quota meter as a slim horizontal fill under the title.
3. **Clip detail sheet:** bottom sheet (`dur-emphasis`) with tap-to-play 9:16 preview,
   caption-style chips, transcript-based trim (drag handles ≥44px), Re-render.
4. **Dashboard / Projects:** vertical list of episodes, each a row with title, stage
   pill, and thumbnail that develops as it renders.

## Reduced-motion & fallback
Film-develop wipe → instant color with an 80ms fade (progress still shown as a
numeric "Rendering 3 of 6"). Stage pulses → color change only. Card stagger and
spring settle collapse to ≤100ms opacity fades. Hero video → its poster still. No
information is ever motion-only.
