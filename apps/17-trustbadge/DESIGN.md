# TrustBadge — Design Specification

## Design vision
The feeling of a shop window with sunlight on it. TrustBadge's product is other
people's happiness rendered credible — so the design is warm daylight, star gold
used with jeweler's discipline, and real customer photos treated as the treasure
they are. Two design systems in one: a warm merchant dashboard, and widgets whose
entire aesthetic is *disappearing gracefully into someone else's brand*.

## Brand identity

| Role | Color | Hex |
|---|---|---|
| Daylight | Warm white | `#FDFBF7` |
| Card | `#FFFFFF` |
| Brand | Star gold | `#F5A623` |
| Trust deep | Amber 700 | `#B45309` |
| Verified | Leaf | `#3B9E6B` |
| Ink | `#221C13` |
| Muted | `#8C8577` |

- **Display:** `Gelica` (fallback `Fraunces`) — shopkeeper warmth; **UI:** `Inter`; **review counts:** tabular with the star glyph custom-drawn (5-point, slightly rounded tips — our star is recognizable at 10px).
- **Logo:** a shield formed by five stars arranged in an arc, the center star largest. Icon: center star on gold.
- **Voice:** merchant-side: practical ("31 review requests going out at 10am"); shopper-side: invisible — the widget never speaks in our voice, only the merchant's.

## Art direction
- **Merchant app:** daylight warmth, photo-forward — review photos display in a masonry with 4px radius, gold reserved for stars and primary actions only.
- **Widgets:** a *token system, not a look* — merchant chooses radius, font (inherit/system/custom), star color; our craft shows in spacing, loading behavior, and motion physics that stay constant across themes. The widget's brand is its performance.
- Verified-buyer mark: a small leaf-check that always renders, non-negotiable — trust integrity as design law.

## The signature moment — "The Constellation"
Marketing hero: hundreds of tiny gold stars drift as loose particles over
daylight (canvas, 300 particles max, gentle brownian motion). On scroll, they
**gravitate and assemble into a 4.8-star rating block** — five large stars
filling as particles dock (the last star fills to 80% and *stops*, honestly),
while a counter rolls to "2,847 reviews" and three real photo-review cards
condense out of the remaining particles beneath (each card's photo develops in
with a soft exposure ramp). Copy: "Proof, assembled." Then the block *shrinks
live into an actual widget embedded in a fake product page* — the pitch that it
all ends up on their store. 60fps on mid phones or particle count halves
automatically.

## Motion system
- **Widget load (the sacred one):** reviews wall/carousel materializes with opacity + 6px rise, 30ms stagger, **zero layout shift** (space pre-reserved) — CLS 0 is a design spec, not just engineering. Total entrance ≤ 400ms.
- **Star fill (shopper leaves a rating):** stars fill with a liquid sweep left→right per star (90ms each), a 1px gold ring pulse on the selected count.
- **Photo review submit:** the shopper's photo thumbnail *stamps* into the form (scale 1.1→1 with a soft shadow press) and the incentive coupon slides down like a receipt.
- **Merchant moderation:** approve = card gets the leaf-check drawing in and files itself right (300ms slide); hide = card exhales to 40% and collapses.
- **Request-sequence timeline:** queued emails as envelopes on a track; sends animate a small departure slide + postmark.
- **Import (Amazon/Etsy CSV):** rows pour into the library as a soft cascade (12 visible max, counter carries the rest).

## Key screens
1. **Marketing hero:** The Constellation; below, a live widget theming playground (adjust radius/color, widget re-themes live) — the product demoing itself; speed receipts ("13KB · <30ms paint · CLS 0.00") typeset like jewelry specs.
2. **Merchant dashboard:** collection funnel (orders → requests → reviews → published) as a horizontal flow with real photos accumulating at the end; rating health dial; latest reviews inbox.
3. **Money screen — Widget studio:** left = every widget type (badge, stars, carousel, wall, floating proof) as live instances; right = token controls; embed code chip updates live and copies with a stamp animation.
4. **Shopper surfaces (email + review form):** merchant-branded, one-question-per-screen flow, photo upload with the stamp moment; ≤ 45 seconds to complete by design.

## Component language
- Buttons: pill, gold fill with ink text; secondary ink-outline on daylight. Press = soft press with warm shadow.
- Review cards: photo-led, 12px radius, star row + verified leaf + date in muted; long text clamps at 4 lines with a quiet "more".
- Empty state: an empty shelf with one gold star resting on it: "Your first review lands here. Want us to ask for it?"
- Charts: warm bars with rounded caps; conversion percentages in Gelica.

## Reduced motion & fallback
Constellation → static assembled rating block with photo cards. Widget entrance → instant render (still CLS 0). Liquid star fills → stepped fills. All animation in shopper-facing widgets defaults conservative; merchants can disable entirely per widget.
