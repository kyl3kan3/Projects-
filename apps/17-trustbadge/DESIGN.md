# TrustBadge — Design Specification

## Vision
Social proof rendered with a jeweler's restraint. TrustBadge is two quiet systems: a
warm merchant dashboard, and widgets whose whole art is disappearing gracefully into
someone else's storefront — fast, still, and honest. The craft is felt as speed and
zero layout shift, not as spectacle.

## Mobile layout (390 × 844)
The merchant app is a Shopify-embedded PWA, thumb-first.
- **Nav:** bottom tab bar (Home · Reviews · Widgets · Settings), 56px tall, clears the
  home indicator with `env(safe-area-inset-bottom)`. Active tab in star gold.
- **Home:** a single scroll — collection funnel (Orders → Requested → Reviewed →
  Published) as four stacked stat rows with the count in Gelica, then a rating-health
  line and the latest-reviews inbox. No sidebars, no dense tables.
- **Primary action** ("Send requests" / "Approve") is a full-width pill fixed in the
  bottom third above the tab bar — always thumb-reachable.
- **Moderation** is a card stack: swipe right approve, left hide, tap opens detail;
  both actions also as 44px buttons on each card.
- **The widget on a phone** is the real deliverable: review wall renders one column,
  cards 12px radius, photo at 1:1, space pre-reserved so the storefront never jumps.

## Identity
| Role | Name | Hex |
|---|---|---|
| Daylight | Warm white | `#FDFBF7` |
| Card | White | `#FFFFFF` |
| Brand | Star gold | `#F5A623` |
| Trust deep | Amber 700 | `#B45309` |
| Verified | Leaf | `#3B9E6B` |
| Ink | Ink brown | `#221C13` |
| Muted | Warm grey | `#8C8577` |

- **Display:** `Gelica` (fallback `Fraunces`) — shopkeeper warmth. **Text/UI:** `Inter`,
  body 16px min. **Data:** tabular figures beside a custom 5-point star glyph, legible
  at 10px.
- **Signature detail — the zero-CLS reveal:** the widget reserves its exact height
  before data arrives, then review cards settle in with opacity + 6px rise, 30ms
  stagger (≤8 at once). Star ratings fill left-to-right per star, 90ms each, stopping
  honestly mid-star (a 4.8 fills the last star to 80% and holds). CLS is a *design*
  spec: 0.00. Runs in the vanilla-JS embed at 60fps, no library.
- Verified-buyer leaf-check always renders — trust integrity as design law.

## Responsive
Single column is the native state. At `md` the dashboard funnel goes horizontal and the
review inbox becomes a two-pane list+detail; the widget wall grows to a 2–4 col masonry
via container queries (it adapts to the *host slot*, not the viewport). **Desktop-only
enhancement:** the marketing site's widget-theming playground shows live re-skinning
across a fake product page — lazy-loaded, never on the widget's own critical path.

## Motion & touch
- Shared tokens only: reveals use `ease-out-quart` at `dur-emphasis`; card file/hide use
  `spring-gentle`; press feedback `dur-micro`.
- Targets ≥44px, ≥8px apart. Swipe-to-moderate has button equivalents.
- Star-rating input on the shopper form uses large 44px tap zones with a 1px gold ring
  pulse on select. Haptic tick on each star when submitted from a native webview.
- Approve = leaf-check draws in, card files right (300ms). Hide = card fades to 40% and
  collapses. Nothing blocks input.

## Key screens
1. **Merchant home (mobile):** funnel stat rows, rating-health line, latest-reviews
   inbox; speed receipts typeset like jewelry specs ("13KB · <30ms · CLS 0.00").
2. **Widget studio (money screen):** each widget type as a live phone-width instance;
   token controls (radius, font, star color) below; embed-code chip copies with a soft
   stamp. The product demoing itself on the device it ships to.
3. **Shopper review form:** merchant-branded, one question per screen, ≤45s; photo
   upload thumbnail presses in (scale 1.1→1) and the incentive coupon slides down like a
   receipt. Star input in the thumb zone.
4. **Moderation stack:** swipeable review cards with photo, stars, verified leaf, date.

## Component language
- Buttons: pill, gold fill / ink text; secondary ink-outline on daylight; ≥44px.
- Review cards: photo-led, 12px radius, star row + leaf + muted date; text clamps at
  4 lines with a quiet "more".
- Empty state: an empty shelf, one gold star resting on it — "Your first review lands
  here. Want us to ask for it?"

## Reduced-motion & fallback
Reveal → instant render (still CLS 0.00). Liquid star fills → stepped fills. Card
file/hide → 100ms opacity fade. Shopper widgets default conservative; merchants can
disable widget motion entirely per widget. Every state is complete without animation.
