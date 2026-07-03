# SubSage — Design Specification

## Design vision
A calm financial companion in your pocket — the opposite of banking-app anxiety.
Deep-night navy, soft mint money, cards that float like they're on water. Every
subscription is a physical object you can pick up, inspect, and throw away —
and throwing one away should feel *fantastic*. Consumer-fintech polish tuned for
one emotion: relief.

## Brand identity

| Role | Color | Hex |
|---|---|---|
| Night | Deep navy | `#0A1128` |
| Surface | Midnight card | `#141B36` |
| Brand | Mint | `#5EEAD4` |
| Money saved | Fresh green | `#4ADE80` |
| Renewal warning | Soft amber | `#FBBF24` |
| Price hike | Rose | `#FB7185` |
| Text | `#EEF2FF` / muted `#8B93B5` |

- **Display & numerals:** `General Sans` (fallback `Plus Jakarta Sans`); the monthly-total figure uses 700 weight with tabular figures — it's the app's face.
- **Logo:** a coin with a leaf growing from its slot — "SubSage". App icon: mint leaf-coin on navy, subtle inner glow.
- **Voice:** wise friend. "Hulu went up $2. That's $24 a year — want the cancel guide?"

## Art direction
- **Card physics as identity:** every subscription is a rounded 20px-radius card with the service's logo, tinted with a 12% wash of the service's brand color on the midnight surface. Cards cast soft 24px shadows and respond to touch like objects with mass.
- Background: an extremely slow aurora gradient (mint→indigo, 40s loop, 6% opacity) behind the home screen only.
- Big-number typography: the monthly total owns the top third of the home screen; everything else is subordinate.

## The signature moment — "The Orbit"
The home screen's monthly total sits at center like a small moon; the user's
subscriptions **orbit it as logo-coins** (Reanimated + Skia; 2.5D — coins scale
and blur slightly with orbital depth, drift at different radii by cost: expensive
subs orbit closer, heavy and near). Pull-to-refresh gives the system a gentle
gravitational stir. Tapping a coin pulls it out of orbit into a detail card
(shared-element transition, 420ms `ease-out-expo`) while the rest of the system
rebalances with spring physics. **Canceling a subscription flings its coin out of
orbit** — a flick gesture, the coin tumbles off-screen with rotation + a mint
particle trail, the monthly total rolls down, and a "saved $15.99/mo" chip floats
up. This is the shareable moment; a subtle "share this save" affordance appears.

## Motion system
- Odometer rolls for every money figure (`spring-gentle`, digits blur 1px mid-roll).
- **Renewal timeline:** upcoming renewals as a horizontal week strip; imminent ones breathe amber (3s cycle); day-of renewals get a 1-frame ripple at 9am local.
- **Price-hike alert:** the sub's card tilts 2° and a rose seam splits its old price from the new one (old price slides down 40% opacity with strikethrough drawing).
- **Email scan (onboarding):** detected subscriptions deal onto the screen like cards from a deck (staggered 80ms, slight rotation randomization ±2°), each asking confirm/deny with swipe.
- Haptics choreographed: light tick on coin grab, medium on cancel-fling release, success notch on total roll-down.

## Key screens
1. **Onboarding:** three screens max — value promise with the orbit teaser (Rive), Gmail connect with an explicit privacy card ("we read receipts, never store bodies" as a literal sealed-envelope illustration), then the paywall.
2. **Home — The Orbit (money screen):** total + orbiting coins + "next 7 days" renewal strip below; insights teaser card at bottom ("You pay for 3 streaming services. Watch time says keep one.").
3. **Paywall:** single screen, orbit frozen artfully behind a frosted sheet; weekly-with-trial hero SKU as a large mint card, annual beneath; restore + terms quiet at bottom. No dark patterns — close X visible at 100% opacity from second one.

## Component language
- Buttons: full-width pills, mint fill with navy text; press = scale 0.97 with haptic.
- Cards: 20px radius, logo left, price right in tabular figures; swipe left reveals cancel-assist (rose), swipe right snoozes (amber).
- Empty state: a lone coin orbiting nothing: "Add your first subscription — or let us scan for them."
- Charts (insights): rounded-cap bars that grow with `spring-gentle`, mint on navy.

## Reduced motion & fallback
Orbit → static ring layout, evenly spaced. Cancel-fling → card slides off with fade + total updates. Aurora off. All haptics preserved (motion-independent). Odometers → direct swap with mint flash.
