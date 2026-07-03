# LumaShot — Design Specification

## Design vision
A high-end photo studio you walk into from your browser: black cyc wall, softboxes
humming, that champagne-flash moment when the strobe fires. LumaShot sells a
*transformation* — selfie to executive — so the design is built entirely around
staging the reveal. Fashion-editorial confidence, studio-hardware textures, light
as the main character.

## Brand identity

| Role | Color | Hex |
|---|---|---|
| Cyc black | `#0A0A0C` |
| Panel | Studio gray | `#161618` |
| Brand | Champagne strobe | `#F4D8A6` |
| Accent | Tungsten | `#FFB86B` |
| Cool key | Softbox white | `#F7F5F2` |
| Text | `#F2F0EC` / muted `#95918A` |

- **Display:** `Editorial New` (fallback `Playfair Display`) italic for emotional beats ("*This could be you, Tuesday.*"); `Neue Montreal` (fallback `Archivo`) for UI.
- **Logo:** "LUMA/SHOT" with the slash as a beam of light at 63° — the beam angle recurs across the interface (gradients, dividers, the reveal wipe).
- **Voice:** flattering but straight. "8 great selfies in. 100 headshots out. 90 minutes."

## Art direction
- Photography-first: interface chrome is nearly invisible; real generated headshots (with model consent/samples) do all the talking, always shown in generous 4:5 crops.
- Light behaves physically: CTAs carry a champagne key-light from upper-left with a soft falloff; hovering "turns on" a rim light (1px warm edge).
- Texture: a faint studio-floor reflection under hero imagery (flipped 8% opacity gradient mask).

## The signature moment — "The Strobe Reveal"
Marketing hero: a 3D studio vignette (R3F) — a softbox, a paper backdrop roll,
and a floating portrait frame showing a real *selfie*. The user's cursor is the
light: moving it repositions the key light on the scene (shader-lit). Clicking
the shutter button fires the sequence: screen flashes champagne (120ms, ease-out),
the softbox blooms, and the selfie in the frame is **replaced by the studio
headshot** — revealed by a 63° beam wipe with a chromatic edge (600ms). A film
counter advances `01 → 02` and a new pair loads. Three clicks in, copy appears:
"Your camera roll is enough." In-product echo: every finished headshot pack
arrives with the beam wipe over its grid.

## Motion system
- **Upload flow:** selfies drop into a contact-sheet grid; each thumb gets a quick focus-pull (blur 8px→0, 300ms) as it validates; rejected shots (blurry/no face) get a red grease-pencil X drawn over them with a shake-free apology tooltip.
- **Training progress:** not a bar — a **darkroom sequence**: a blank sheet in developer fluid, the portrait faintly emerging in stages tied to real progress (5 keyframed opacity/contrast steps). Copy: "Developing your model — 40 min."
- **Results grid:** headshots deal in with 30ms stagger, slight scale 1.02→1 settle; hovering any shot re-lights it (subtle exposure +5%).
- **Style switcher:** style tabs slide a physical backdrop roll behind the preview (paper-roll texture translates horizontally, 420ms `ease-in-out-soft`).
- **Pack purchase:** the checkout button's key-light intensifies as the cursor approaches (proximity glow, 120px radius).

## Key screens
1. **Marketing hero:** The Strobe Reveal; below, an editorial marquee of before/after pairs auto-advancing (crossfade 4s hold), then pack pricing as three film-box cards (40/100/200 exposures).
2. **Upload & brief:** contact-sheet grid left, guidance right ("vary angles, no sunglasses") illustrated with tiny do/don't thumbnails; the CTA arms only when 8 valid shots are in (button light warms up per valid shot — 8 stops of brightness).
3. **Money screen — The Gallery:** the delivered pack as a lit exhibition: styles as backdrop sections, favorites tray at bottom, one-click "LinkedIn crop" per shot, download-all as a film canister icon that spins closed.

## Component language
- Buttons: pill, champagne fill with cyc-black text; secondary is 1px warm outline. Disabled = light off (true gray, no glow).
- Cards: photos edge-to-edge, 8px radius, floor-reflection under featured items.
- Empty state: an unlit studio, single tungsten practical glowing: "Lights are ready when you are."
- Progress: darkroom develop, beam wipes, focus pulls — never bars or spinners.

## Reduced motion & fallback
Strobe flash removed (photosensitivity: flash is opacity 0.4 max and disabled under reduced motion). Reveal → crossfade. Cursor-lighting off; static key light. Develop sequence → stepped stills with captions.
