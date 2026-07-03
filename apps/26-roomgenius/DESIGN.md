# RoomGenius — Design Specification

## Vision
Someone stands in their living room, photographs it, and wants to see it better —
right there, on the phone in their hand. RoomGenius is warm, photographic, and
quiet: the room is the interface, chrome recedes to thin plaster, and the one moving
part is a before/after reveal that feels like light, not a shader demo.

## Mobile layout (390 × 844)
- **Nav:** minimal top bar — back, room name, and an HD/download action; a bottom tab
  bar (Rooms · Styles · Shop · Pro) sits in the thumb zone. Most screens are photo-first
  with controls floating as frosted-linen pills on the image.
- **Hero (Reveal screen):** the render fills the screen edge-to-edge. A **before/after
  slider** with a brass-crank handle sits centered and large (the handle is a 44px touch
  target); dragging wipes between the user's photo and the restyle. Below the image, a
  horizontal **style swatch rail** scrolls — tap a swatch to re-render in that style.
- **Primary action:** the **camera / upload** button is a full-width pill fixed in the
  bottom third on the home screen ("Photograph your room"); on the reveal screen the
  thumb-zone action is **Save look** / **Shop this room**.
- **Key components at phone width:** upload comes straight from the camera roll or live
  camera; the room-type chip auto-stamps on the image ("LIVING ROOM", tap to change);
  shop hotspots are 44px sun-dots that open a product sheet sliding up from the bottom.

## Identity
| Role | Name | Hex |
|---|---|---|
| Plaster (warm off-white) | `#F6F1E9` |
| Clay (terracotta / CTA) | `#C96F4A` |
| Sage | `#8A9B6E` |
| Charcoal ink | `#2A2622` |
| Sun (golden hour accent) | `#E8B04B` |
| Muted | `#9A8F82` |

- **Type:** display **Fraunces** for room and style headings — interiors-magazine warmth;
  **Inter** for UI/body (≥16px mobile); style names set small-caps letterspaced
  (JAPANDI · MID-CENTURY · FARMHOUSE) like fabric swatch labels; simple counts in Inter
  tabular.
- **Signature detail — the light reveal:** when a render finishes, the before/after
  wipe crosses the image with a soft golden-hour warm edge (single pass, 320ms,
  `dur-emphasis`) so the change reads as sunlight rather than a crossfade. It is a
  pre-composited CSS mask gradient on two stacked images — flawless at 60fps on any
  phone, no live shader, no WebGL. Dragging the crank scrubs the same edge manually.
- Materials: cards carry a 2% linen texture, warm-toned shadows, 16px radius —
  soft-furnished, not bubbly.

## Responsive
The phone reveal scales up to a centered stage with the swatch book beside it on `lg`;
the shop sheet becomes a docked right rail. **Optional desktop enhancement:** a subtle
2.5D parallax on the render from its depth map (foreground furniture separates ~10px on
cursor move) — pointer-only, lazy-loaded, off on touch and reduced-motion; the phone
reveal is complete without it.

## Motion & touch
- Generation wait (30–60s) is honest and calm: a pencil-line sketch of the detected room
  structure draws itself (8s loop) with the chosen swatch pinned — "Reading your room's
  bones." No fake progress bar.
- Style swatches re-render with the light reveal at 40% intensity, staggered as they
  arrive (≤8 at once).
- Targets ≥44px. **Swipe the before/after slider** or use its handle; **tap a hotspot**
  to shop, with a list-view button equivalent for all detected items. Long-press a render
  to save. Light haptic on a completed render (native).

## Key screens
1. **Home / upload:** big friendly capture button, recent rooms as a vertical card feed;
   empty state — a sketch of an empty room with light entering: "Show us a room. Phone
   photos are perfect."
2. **Reveal (money screen):** the full-bleed render, crank slider, style rail, shop dots.
3. **Style picker:** the swatch book — photographic-crop cards in a scroll grid, tap to
   pin up to 5 for a batch.
4. **Pro dashboard:** listing batches as contact-sheet thumbnails, per-room status, a
   one-press "VIRTUALLY STAGED" MLS disclosure stamp, zip export; visually cooler and
   quieter (plaster shifts to `#F2F0EC`, motion halved).

## Reduced-motion & fallback
Light reveal → plain crossfade, slider still functional. Parallax off. Sketch wait state
→ static sketch with a text timer. Hotspot dots static. All style changes instant with a
soft warm flash. Motion collapses to ≤100ms opacity.
