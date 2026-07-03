# SubSage — Design Specification

## Vision
A calm financial companion in your pocket — the opposite of banking-app anxiety.
Deep-night navy, soft mint, and one emotion tuned above all: relief. Every subscription
is a tidy object you can inspect and throw away, and throwing one away should feel
quietly great. This is a native mobile app first, last, and always.

## Mobile layout (390 × 844 — the primary spec)
SubSage *is* a phone app (Expo). The entire product is the 390-wide screen; there is no
"real" desktop version to scale from.

- **Nav:** bottom tab bar — Home · Renewals · Insights · Settings — above the home
  indicator; mint on the active item only.
- **Home:** the **monthly total** owns the top third — large, tabular, 700 weight, the
  app's face. Beneath it a "next 7 days" renewal strip, then a single vertical list of
  subscription cards (not an orbit — a calm, scannable stack), then one insight teaser
  card at the bottom.
- **Primary action** in the thumb zone: a full-width **Add subscription** button pinned
  bottom; the **Scan email for subscriptions** entry sits just above it on first run.
- **Subscription card:** 20px radius, service logo left, price right in tabular figures,
  next-renewal below. Tinted with a 12% wash of the service's brand color on the
  midnight surface. Swipe left reveals **cancel-assist** (rose); swipe right **snoozes**
  a reminder (amber) — each also reachable via a tap-in detail sheet.
- **Key components at phone width:** renewal strip chip; price-history sparkline; the
  privacy card ("we read receipts, never store bodies"); the paywall sheet.

## Identity
| Role | Hex |
|---|---|
| Night (navy) | `#0A1128` |
| Surface (midnight card) | `#141B36` |
| Brand mint | `#5EEAD4` |
| Money saved (green) | `#4ADE80` |
| Renewal warning (amber) | `#FBBF24` |
| Price hike (rose) | `#FB7185` |
| Text | `#EEF2FF` / muted `#8B93B5` |

- **Display & numerals:** `General Sans` (fallback `Plus Jakarta Sans`); the monthly
  total is 700 weight, tabular figures. Body ≥16px throughout.
- **Voice:** wise friend. "Hulu went up $2 — that's $24 a year. Want the cancel guide?"
- **Signature detail — the total that responds.** The monthly-total figure is a live
  odometer: cancel a subscription and the number **rolls down** (`spring-gentle`, digits
  blur ~1px mid-roll) while a "saved $15.99/mo" chip floats up and settles; add one and
  it rolls up. It's the one satisfying, shareable moment, done with Reanimated on the UI
  thread at 60fps — no Skia orbital physics, no particle field. The relief is in the
  number moving, not in a space scene.

## Responsive
This is a phone app; there is no tablet/desktop product. It adapts *within* mobile:
respect `env(safe-area-inset-*)` and Dynamic Island; scale type via the OS font-size
setting; support landscape by widening the card list to two columns on larger phones
and small tablets. No WebGL, no desktop enhancement — the constraint is the point.

## Motion & touch
- Uses the shared token spirit via Reanimated 3 equivalents. Money figures odometer-roll
  (`spring-gentle`). Renewal strip: imminent renewals breathe amber (3s); day-of gets a
  single 9am ripple.
- Price-hike alert: the card tilts 2° and a rose seam splits old price from new (old
  price slides down to 40% opacity with a strikethrough drawing).
- Email scan (onboarding): detected subscriptions deal onto the screen like cards from a
  deck (80ms stagger, ±2° rotation), each confirmed/denied by swipe or button.
- **Touch:** targets ≥44px; primary buttons are full-width pills, mint fill with navy
  text, press scales 0.97.
- **Gestures:** swipe-to-cancel and swipe-to-snooze on cards (both mirrored as buttons
  in the detail sheet); pull-to-refresh re-scans recent receipts (also a refresh
  control). **Haptics choreographed and motion-independent:** light tick on card grab,
  medium on cancel confirm, success notch on the total's roll-down.

## Key screens (mobile-first)
1. **Home:** monthly total + 7-day renewal strip + subscription list + insight teaser.
2. **Onboarding:** value promise → Gmail connect with an explicit sealed-envelope
   privacy card → paywall (weekly-with-trial hero SKU, annual beneath, close X visible
   at full opacity from the first second; no dark patterns).
3. **Subscription detail:** logo, price history sparkline, next renewal, cancel-assist
   guide with deep link.
4. **Insights:** monthly/annual totals, category breakdown, month-over-month delta as
   rounded-cap mint bars that grow with `spring-gentle`.

## Reduced-motion & fallback
Odometer rolls → direct number swap with a mint flash. Card-deal onboarding → cards
appear at once with an 80ms fade. Price-hike tilt/seam → static old→new price with a
rose label. Amber breathing → solid amber. **Haptics are preserved** (they're
motion-independent and carry the relief). Every figure and status is also plain text.
