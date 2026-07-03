# RoomGenius — Design Specification

## Design vision
Sunlight moving through a room you already love. RoomGenius sells the moment of
seeing *your own space* transformed — so the design is warm plaster, terracotta,
linen white, and an interface that behaves like light: reveals, not transitions;
materials, not chrome. It should feel closer to an architecture studio's
portfolio than an AI tool — because the output has to be worth hanging.

## Brand identity

| Role | Color | Hex |
|---|---|---|
| Plaster | Warm off-white | `#F6F1E9` |
| Clay | Terracotta | `#C96F4A` |
| Sage | `#8A9B6E` |
| Charcoal ink | `#2A2622` |
| Sun | Golden hour | `#E8B04B` |
| Muted | `#9A8F82` |

- **Display:** `Canela Deck` (fallback `Fraunces`) — interiors-magazine headlines; **UI:** `Untitled Sans` (fallback `Inter`); style names set in small caps with letterspacing (JAPANDI · MID-CENTURY · FARMHOUSE) like fabric swatch labels.
- **Logo:** a doorframe containing a sparkle-point of light. Icon: lit doorframe on plaster.
- **Voice:** interior designer's warmth. "Same bones. New light. Here's your room in Japandi."

## Art direction
- Photography is the interface: user rooms and renders shown huge, chrome recedes to thin plaster bars; controls sit on the image as frosted-linen pills.
- Material honesty: buttons and cards carry subtle paper/linen texture (2%); shadows warm-toned; radius 16px — soft-furnished, not bubbly.
- Style swatches: each of the 20 styles has a woven swatch card (photographic texture crop + small-caps name + 3-dot palette) — the style picker should feel like flipping fabric samples.

## The signature moment — "The Golden Hour"
The reveal. After generation, the user's original photo fills the screen — then
**light transforms it**: a soft-edged golden-hour beam sweeps across the image
(shader wipe with warm bloom at the leading edge, 900ms `ease-in-out-soft`),
and in its wake the restyled room emerges — not a crossfade, a *relighting*:
the beam edge locally brightens 8% so the change reads as sunlight revealing
what was always possible. Because generation preserves structure, walls and
windows stay pinned; only the world inside changes. Then depth awakens: a
**2.5D parallax** from the render's depth map (foreground furniture separates
~10px on device tilt / cursor move) making the render feel inhabitable. The
before/after slider handle is a brass window-crank; dragging it drags the beam.
Multiple styles queue as swatches below; tapping one re-runs the beam in that
style's tint. Users record this and post it — the wipe must be flawless at
60fps (pre-composited on-device, not live-shadered on low-end).

## Motion system
- **Upload:** the photo develops in (exposure ramp 400ms) and the room-type chip auto-stamps ("LIVING ROOM" small caps, press-in) with a correct/change affordance.
- **Generation wait (30–60s):** an honest, beautiful state — a pencil-sketch of the room's detected structure draws itself (edges from the depth/edge pass, 8s loop) with the style's swatch pinned beside it: "Reading your room's bones…" No fake progress bars.
- **Style grid results:** renders deal in as they finish (each with a mini beam wipe at 40% intensity, staggered by arrival).
- **Shop the look:** hotspot dots breathe gently on furniture (2 max animating at once); tapping one blooms a product tray sliding up as a linen sheet — product cards with price, "similar in stock" alternates in a horizontal flip-through.
- **Pro staging batch:** rooms process as a contact sheet; each completion gets a small beam tick; the MLS-disclosure stamp applies to all with one press ("VIRTUALLY STAGED" embossed corner).

## Key screens
1. **Marketing hero:** a full-bleed Golden Hour reveal on loop (three rooms, three styles), the crank-slider invitingly present; beneath, the style swatch wall (all 20, hoverable), then the shop-the-look demo with live hotspots.
2. **Money screen — The Reveal:** as specced; actions kept to slider, style swatches, hotspots toggle, HD download.
3. **Style picker:** the swatch book — fabric cards in a loose grid, tap to pin up to 5 for a batch.
4. **Pro dashboard:** listing batches as contact sheets, per-room status, disclosure toggle, zip export; visually quieter (pros live here — plaster turns cooler `#F2F0EC`, motion halves).

## Component language
- Buttons: linen pills with charcoal ink text; primary = terracotta. Press = soft cushion (0.97 + warm shadow tuck).
- Cards: 16px radius, warm shadow, texture at 2%.
- Hotspots: 10px sun-dots with a 1px plaster ring; active = ring expands to a tray.
- Empty state: an empty room sketch with a beam of light entering: "Show us a room. Phone photos are perfect."

## Reduced motion & fallback
Beam reveal → crossfade with the slider still functional. Parallax off. Sketch-drawing wait state → static sketch with a text timer. Hotspot breathing → static dots. All swatch/style changes instant with a warm flash.
