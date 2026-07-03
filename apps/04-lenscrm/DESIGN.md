# LensCRM — Design Specification

## Vision
A gallery after hours. LensCRM should make a solo photographer feel like they run a
prestige studio — charcoal walls, museum lighting, brass details, and their own work
treated as the hero of every screen. The business machinery (leads, contracts,
invoices) is staged like exhibition placards beside the art: quiet, serifed,
inevitable.

## Mobile layout (390 × 844 — the primary spec)
Photographers run their business between shoots, from their phone. The admin app is
charcoal; the client-facing gallery and booking pages are the growth loop and get
their own light treatment.

- **Nav:** bottom tab bar — Today · Leads · Sessions · Galleries · More — above the
  home indicator; brass only on the active item.
- **Studio dashboard ("This week on the wall"):** a single vertical column of session
  cards. Each is the photographer's own image bleeding edge-to-edge with a **placard
  strip** below (date · client · balance due) in small-caps. Today's tasks run as a
  short list threaded by a thin brass rule.
- **Primary action** in the thumb zone: a full-width contextual button per screen —
  **Deliver gallery**, **Send contract**, **Request deposit** — pinned bottom.
- **Client gallery (money screen)** on a phone: edge-to-edge masonry of the shoot, the
  photographer's logotype centered top, tap a photo for full-screen with proofing
  controls (heart / comment ≥44px). This must be beautiful enough that clients ask who
  built it.
- **Key components at phone width:** lead card (small print with placard metadata);
  booking-type row; contract signing sheet (draw/type signature, ≥44px controls);
  invoice styled like fine stationery with old-style figures.

## Identity
| Role | Hex |
|---|---|
| Wall (charcoal) | `#141414` |
| Panel (soft black) | `#1D1D1B` |
| Brand brass | `#C9A227` |
| Silver halide | `#C8CDD4` |
| Paper (light mode) | `#F5F4F1` |
| Fern (success) | `#7BA05B` |
| Text | `#F0EEE9` / muted `#9C9890` |

- **Display:** `Canela` (fallback `Fraunces`) — museum-label elegance.
- **Text/UI:** `Untitled Sans` (fallback `Inter`), 16px min. **Data/figures:**
  `Fraunces` old-style figures on invoices — stationery, not spreadsheet.
- **Brass is gilding:** 1px rules, small-caps labels, the aperture glyph — never large
  fills.
- **Signature detail — the aperture wipe.** The "e" in the logo is a 6-blade aperture,
  and the app's ritual transitions (opening a gallery, delivering it, countersigning a
  contract) pass through a fast **SVG iris wipe** — 6 blades close and reopen in ~400ms.
  It's a small, purposeful brand punctuation that runs at 60fps on a phone (SVG/CSS,
  no WebGL, no depth-map parallax). One considered move, used sparingly.

## Responsive
The phone's single column of framed sessions becomes a two-up grid on tablet and a
gallery-wall layout on desktop (≥1024px) with a persistent left rail (leads pipeline
as kanban columns). Client galleries scale from phone masonry to a full-bleed desktop
lightbox. **Optional desktop enhancement:** the marketing hero may add a subtle 2.5D
parallax (depth-map, mouse-driven) over rotating portfolio work, lazy-loaded behind a
static poster; it never loads on mobile, where the hero is a full-bleed photo with the
iris wipe on entry.

## Motion & touch
- Shared tokens. Lead cards on the pipeline pick up on drag (scale 1.03, shadow
  deepens, -1° tilt) and settle with `spring-gentle`; the target column brightens 4%.
- Invoice paid: the total's underline draws in fern; the placard flips PROFORMA → PAID
  (single split-flap tile). No confetti — the aperture blinks once.
- Gallery proofing: a favorite gets a brass corner tick that draws itself; the
  selection count odometer-rolls.
- **Touch:** targets ≥44px; proofing hearts, signature pad, and the primary bar all in
  the thumb zone.
- **Gestures:** swipe between gallery photos; swipe a lead card to advance stage (also
  a stage dropdown). Native haptics on the Expo client for sign/deliver; web silent.

## Key screens (mobile-first)
1. **Studio dashboard:** framed sessions with placards, brass-threaded task list.
2. **Client gallery:** edge-to-edge masonry, proofing, iris wipe on delivery.
3. **Deposit-first booking flow:** one atomic sheet — hold date, attach contract,
   request retainer — with a clear "Booking confirms when the deposit clears" line.
4. **Contract signing (client-facing, light mode):** single-column guest-book styling,
   hairline-underlined inputs, sign, "Executed" emboss.

## Reduced-motion & fallback
Iris wipes → 120ms crossfade. Parallax off; hero is a still photo. Drag physics →
instant placement with a brass flash on the destination. Signature replay → static
rendered signature. All status conveyed by motion also written in text.
