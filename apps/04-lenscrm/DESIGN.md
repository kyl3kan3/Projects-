# LensCRM — Design Specification

## Design vision
A gallery after hours. LensCRM must make a solo photographer feel like they run a
prestige studio: charcoal walls, museum lighting, brass details, their own
photography treated as the hero of every screen. The business machinery (leads,
contracts, invoices) is staged like exhibition placards beside the art — quiet,
serifed, inevitable.

## Brand identity

| Role | Color | Hex |
|---|---|---|
| Wall | Deep charcoal | `#141414` |
| Panel | Soft black | `#1D1D1B` |
| Brand | Brass | `#C9A227` |
| Accent | Silver halide | `#C8CDD4` |
| Paper (light mode) | Gallery white | `#F5F4F1` |
| Success | Fern | `#7BA05B` |
| Text | `#F0EEE9` / muted `#9C9890` |

- **Display:** `Canela` (fallback `Fraunces`) — museum-label elegance.
- **UI:** `Untitled Sans` (fallback `Inter`). Numbers in invoices: `Fraunces` with old-style figures — invoices should look like fine stationery.
- **Logo:** "LensCRM" set in Canela; the "e" is a tiny aperture (6-blade iris). The iris is the app icon and the loading motif.
- **Voice:** gallerist. "Your gallery for the Hartmann wedding is ready to deliver."

## Art direction
- **The user's photos are the interface.** Every client card, session card, and gallery is art-directed around their imagery with a 2:3 or 3:2 crop, everything else recedes to charcoal.
- Brass is used like gilding: 1px rules, small caps labels, the aperture glyph — never large fills.
- Client-facing surfaces (galleries, booking pages, contracts) default to Gallery-white light mode with the photographer's brand colors layered in; the photographer's admin stays charcoal.

## The signature moment — "The Aperture"
Every meaningful transition passes through a **6-blade aperture iris**. Marketing
hero: full-bleed photograph (rotating portfolio of real wedding/portrait work);
an aperture iris opens from black over it (blades are true geometry, WebGL or SVG
with 3D bevel lighting, 900ms `ease-out-expo`), and as it opens, the photo gains
depth — a subtle 2.5D parallax from a depth map (foreground subject separates
~12px from background on mouse move). Placard text fades up beside it: "Run the
studio. Keep shooting." In-product: opening a gallery, delivering a gallery, and
countersigning a contract each get a fast iris wipe (400ms) — the brand ritual.

## Motion system
- **Pipeline board (leads):** columns like gallery walls; lead cards are small prints that pick up (scale 1.03, shadow deepens, slight -1° tilt) on drag and settle with `spring-gentle`; the drop column's wall brightens 4%.
- **Contract signing (client-facing):** the signature stroke replays after signing (1s, brass ink), then the document stamps "Executed" with a 2px emboss press; confetti is forbidden — instead the aperture blinks once.
- **Invoice paid:** the total's underline draws in fern green and the placard label flips from PROFORMA to PAID (split-flap, single tile).
- **Gallery proofing:** client favorites get a brass corner tick that draws itself; the selection count in the tray does an odometer roll.
- **Workflow automations:** steps light like track-lighting along a rail, left to right, each with a 150ms warm-up glow.

## Key screens
1. **Marketing hero:** The Aperture over rotating portfolio work; below, a triptych — Booking / Contract / Gallery — framed like three prints with placards.
2. **Studio dashboard:** "This week on the wall" — sessions as framed prints on the charcoal wall with placard metadata (date, client, balance due); a brass thread runs through today's tasks list.
3. **Money screen — the Client Gallery:** edge-to-edge masonry of the shoot, photographer's logotype top-center, hover reveals proofing controls; download delivers with the iris wipe. This page must be beautiful enough that *clients* ask who built it — it's the growth loop.

## Component language
- Buttons: rectangular with 4px radius (frame-like), brass outline default; primary = brass fill with charcoal text. Press = 1px inset like pressing into matboard.
- Cards: photos bleed to edge; metadata sits on a placard strip below with small-caps labels.
- Empty states: an empty brass frame on the wall; "Hang your first session here."
- Forms (booking): single-column, Canela section headings, inputs as hairline-underlined lines like a guest book.

## Reduced motion & fallback
Iris wipes → 120ms crossfade. Parallax off. Drag physics → instant placement with a brass flash on the destination. Signature replay → static rendered signature.
