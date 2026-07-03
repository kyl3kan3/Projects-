# ClipForge — Design Specification

## Design vision
A midnight edit suite that feels alive. The user walks into a dark room where their
raw footage is already being carved into gems — machinery you can *feel* working:
light moving through film, waveforms breathing, clips snapping into place with the
weight of a flatbed editor. Confidence, velocity, zero clutter. Premiere Pro's power
with a trailer-house's glamour.

## Brand identity

| Role | Color | Hex |
|---|---|---|
| Ink (base) | Near-black blue | `#0B0F17` |
| Panel | Raised slate | `#121826` |
| Brand | Electric violet | `#6D5EFC` |
| Brand hot | Lavender glow | `#A78BFA` |
| Signal | Cutter cyan | `#22D3EE` |
| Success | Render green | `#34D399` |
| Text | Frost | `#E8ECF6` / muted `#8B97B3` |

- **Display type:** `Clash Display` (semibold, tight -2% tracking) — headlines cut like title cards.
- **Body:** `Inter` 15–16px. **Mono (timecodes):** `JetBrains Mono` — every timestamp in the product renders mono with tabular figures.
- **Logo:** wordmark where the "F" is a film-strip notch; the notch doubles as the app icon (a violet-to-cyan gradient chip with the notch cut out).
- **Voice:** cutting-room laconic. "Rendering." not "We're processing your video!"

## Art direction
- Depth from **light, not borders**: panels get a 1px top inner highlight (`rgba(255,255,255,.06)`) and a soft 24px ambient shadow; the violet brand color is treated as *light* that leaks (blurred glows behind CTAs and active clips).
- A faint film-grain overlay (`opacity .03`, animated at 12fps) on marketing surfaces only — never on the dashboard.
- 12-col grid, 80px gutters marketing; product uses an 8px baseline grid, density like a pro NLE.

## The signature moment — "The Ribbon"
Marketing hero: a **3D film ribbon** (R3F) — one continuous strip of the user's
"footage" (emissive video-texture frames) flowing in a lazy S-curve through the dark.
On scroll, the ribbon tightens, and a cyan laser plane sweeps it (GLSL scanline);
where the laser crosses, the strip **cleaves into floating vertical 9:16 shards**
that rotate to face camera, captions popping onto them word-by-word. Copy beside it:
"One upload in. A week of content out." Scroll velocity drives cleave rate
(clamped); idle state loops a slow drift. 45k tris, one 512² video texture,
poster fallback: still render of the shard burst.

## Motion system
- **Pipeline choreography (dashboard):** the status pill morphs between stages with a liquid pill-to-pill slide (`ease-in-out-soft`, `dur-standard`); each completed stage fires a 6px cyan pulse ring outward (`dur-emphasis`, opacity 0.4→0).
- **Clip cards** enter with `spring-gentle`, staggered 40ms, rising 16px — like prints being laid on a light table.
- **Render progress:** clip thumbnails develop like film — a grayscale→color wipe left-to-right tied to actual render progress.
- **Caption restyle:** the clip's caption band flips 180° on X-axis (`spring-snappy`) revealing the new style, then the re-render shimmer (diagonal specular sweep, 1.2s loop) runs until ready.
- **Copy buttons:** press scales 0.96 (`dur-micro`); on success the label slides up and is replaced by "Copied" with a cyan check that draws itself (200ms stroke animation).

## Key screens
1. **Marketing hero:** The Ribbon left-of-center 60%, copy right 40%; below the fold, a real content-kit example rendered as a masonry of clip shards + a thread card, each revealed by scroll-linked laser sweep.
2. **Dashboard:** left rail (workspace, quota meter as a slim vertical film-strip that fills), center project list as horizontal "reels" with sprocket-hole edge detail on hover, upload card top-right with a pulsing drop zone (breathes 1.04 scale, 3s loop).
3. **Money screen — the Kit view:** a three-lane light table: Clips lane (9:16 cards with hover-to-play), Words lane (thread/LinkedIn/newsletter as stacked paper cards), and a right sidebar transcript with the chosen clip ranges highlighted in violet — clicking a highlight scrolls its clip into view with a cyan flash.

## Component language
- Buttons: 10px radius, gradient (`#A78BFA→#6D5EFC`) primary with 24px violet glow at 25% under it; ghost buttons are panel-toned with 1px line, glow appears only on hover.
- Cards: 14px radius, hover lifts 2px + glow; active project card gets a 2px cyan left rule.
- Empty state: a tiny looping Rive of a film strip folding into a paper plane. Copy: "Nothing on the table. Feed me an episode."
- Loading: never spinners — always the scanline sweep or film-develop wipe.

## Reduced motion & fallback
Ribbon → poster still. Film-develop wipes → instant with 80ms fade. Status pulses → color change only. Grain removed. All information conveyed by motion also exists as text ("Rendering 3 of 6").
