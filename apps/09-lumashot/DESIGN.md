# LumaShot — Design Specification

## 1. Vision
LumaShot sells one transformation: your camera roll becomes a studio headshot in
under 30 minutes. The design is photography-first and quiet — the interface gets
out of the way so real generated headshots carry the product. Editorial
confidence, warm studio light as the only decoration, no theme-park staging.

## 2. Mobile layout (390×844)
The whole flow is thumb-driven because most selfies live on the phone.

- **Nav:** a lightweight top bar (logo left, account right) plus a persistent
  bottom action bar that holds the one primary CTA for the current step. No
  hamburger; the flow is linear (Pick pack → Upload → Track → Gallery).
- **Landing:** a single full-bleed 4:5 hero headshot, one editorial line over it
  (*"Studio headshots from your camera roll."*), and one filled champagne CTA in
  the bottom third — **"See the styles."** Below the fold: a swipeable
  before/after strip and three pack cards stacked vertically ($19 / $29 / $49),
  each a tap-target-sized row with price, count, styles.
- **Upload:** a 3-column contact-sheet grid of thumbnails fills the screen;
  system photo picker opens on tap. A sticky bottom counter ("6 of 8 minimum")
  doubles as the CTA and only arms — champagne fill — at 8 valid shots.
- **Gallery (money screen):** 2-column masonry of finished headshots, style
  chips as a horizontal scroller under the top bar. Tap opens a full-screen
  pager (swipe between shots); actions (favorite, LinkedIn crop, download) sit in
  a bottom sheet within thumb reach.
- Body ≥16px; all rows ≥56px; primary actions never in a corner.

## 3. Identity
| Role | Name | Hex |
|---|---|---|
| Base | Cyc black | `#0A0A0C` |
| Panel | Studio gray | `#161618` |
| Brand | Champagne | `#F4D8A6` |
| Accent | Tungsten | `#FFB86B` |
| Text | Softbox white | `#F2F0EC` |
| Muted | Ash | `#95918A` |

- **Display:** `Editorial New` (fallback `Playfair Display`) italic — used only for
  the one emotional line per screen. **UI/text:** `Neue Montreal` (fallback
  `Archivo`). No data font needed; counts sit in the UI face.
- **Logo:** `LUMA/SHOT`, the slash a thin 63° light beam — reused once as the
  results divider, nowhere else.
- **Signature detail — the key-light sweep.** When a headshot finishes and lands
  in the gallery, a soft champagne highlight sweeps once across it left-to-right
  (~600ms, `ease-out-quart`), then settles. Pure CSS gradient mask over the
  image; runs at 60fps on any phone. That single sweep is the "it's ready"
  moment — no strobe, no 3D studio.

## 4. Responsive
Mobile is the master. Tablet widens the gallery to 3 columns and puts pack cards
in a row. Desktop adds a two-pane upload (contact sheet + live guidance) and a
larger editorial hero, but the layout, type scale, and the key-light sweep are
identical. **Optional desktop-only enhancement:** on the marketing hero, a subtle
cursor-follow key light that repositions the highlight on the hero portrait —
lazy, pointer-only, never loaded on touch devices, and the static lit portrait is
the complete default.

## 5. Motion & touch
- Uses shared tokens: reveals `ease-out-quart`; layout `ease-in-out-soft`;
  buttons `spring-snappy`; sheets `dur-emphasis`.
- **Upload validation:** each thumb resolves from blur to sharp (`dur-standard`)
  as it passes; rejects get a quiet red corner tick and a plain reason ("face too
  small — move closer"), no shake.
- **Training progress:** an honest stepped state (Uploading → Validating →
  Training → Generating → Ready) with a slim determinate bar tied to real
  progress; copy gives a live ETA. No darkroom theatrics.
- **Results:** headshots deal in with 24ms stagger, ≤8 at once, scale 1.02→1.
- **Touch:** targets ≥44px; swipe between headshots in the pager (with visible
  ‹ › arrows as equivalents); pull-to-refresh on the status screen; long-press a
  shot to favorite (star button is the equivalent).
- **Haptics** (where the platform allows): light tick on favorite, success notch
  when the pack turns Ready.

## 6. Key screens (mobile-first)
1. **Landing:** full-bleed hero portrait + one italic line + champagne CTA in the
   thumb zone; before/after strip and three pack rows below.
2. **Upload & brief:** contact-sheet grid, inline do/don't hints as a collapsible
   note, sticky arming counter/CTA at the bottom.
3. **Status:** one card with the stepped pipeline, live ETA, and a visible
   deletion countdown ("Photos auto-delete in 7 days · Delete now").
4. **Gallery (money):** masonry grid, style-chip scroller, full-screen pager with
   a bottom action sheet (favorite / LinkedIn crop / download all).

## 7. Reduced-motion & fallback
Key-light sweep → a single 100ms opacity settle as the image appears. Validation
blur-to-sharp → instant with the corner tick. Stagger off; headshots appear
together. Progress bar stays (it's information). Desktop cursor light disabled;
static lit portrait shown.
