# ClientDock — Design Specification

## Vision
ClientDock makes a small agency feel like a firm with a lobby. The client almost
always arrives on a phone, tapping a magic link from an email — so the **portal's
mobile experience is the product**. It should feel like being handed the key to your
suite: calm hospitality materials, the client's name in serif, and everything they
need already in order. The choreography is ours; the house is fully the agency's.

## Mobile layout (390 × 844)
- **Client portal nav:** opens to a welcome band — the agency monogram and the client's
  name set in serif ("Welcome, Meridian"). Below it, a **front desk** card: "since your
  last visit" items and anything **awaiting you** (bell-amber chips). Then the module
  rooms as a vertical list of labeled cards (Timeline · Files · Approvals · Messages ·
  Invoices), each tappable into a full screen. No sidebar; a slim top bar holds the
  monogram and a menu.
- **Hero / primary action:** the thumb-zone action is context-driven — usually **Approve**
  or **Reply** on whatever needs the client. On an approval, a full-width brass **Approve**
  button and a secondary **Request changes** sit fixed in the bottom third.
- **Agency-side nav:** a bottom tab bar (Portals · Needs attention · Compose · Settings);
  the dashboard is a vertical feed of portal cards, not a wide grid.
- **Key components at phone width:** deliverable previews fill the width with the approve
  bar docked below; file versions stack as tabbed cards; the footer is agency-branded, or
  a whisper-small "via ClientDock" on Solo tier only.

## Identity
| Role | Name | Hex |
|---|---|---|
| Ivory stone | `#F4F1EA` |
| Club green (headers / CTA) | `#1E4D3B` |
| Brass (keys, rails, stamp) | `#B99552` |
| Ledger ink | `#20241F` |
| Approved (stamp green) | `#3E8E5A` |
| Awaiting (bell amber) | `#D9A441` |

Muted `#8A877C`.

- **Type:** display **Playfair Display** for portal headings and the guest's name —
  engraved-invitation elegance; **Inter** for UI/body (≥16px mobile); audit lines and
  timestamps in a ledger mono (**IBM Plex Mono**). On Agency tier every token here is
  replaceable and no ClientDock trace remains — vanishing gracefully is the system's flex.
- **Signature detail — the arrival, restrained:** first magic-link open per session plays
  a brief entry — the agency monogram panel settles and each module card lights its brass
  signage chip in an 80ms stagger (`dur-emphasis` total ≈ 600ms), skippable by scroll.
  This replaces any 3D swinging-door scene: a composed reveal in HTML+CSS, 60fps on any
  phone, first-class on its own. Repeat visits skip straight to the lobby.
- Status uses hotel signage: small brass-framed engraved small-caps chips — IN PROGRESS ·
  AWAITING YOU · APPROVED.

## Responsive
The phone portal scales to a centered lobby column (~65ch) with modules as a calm grid on
`lg`; the agency dashboard becomes a portfolio wall of portal cards with freshness dials
and pulse sparklines. **Optional desktop enhancement:** the live "type your agency name,
pick two colors, watch it re-skin" theming demo on the marketing page — pointer surface,
never on the client's mobile critical path.

## Motion & touch
- **Approval (the money interaction):** Approve presses a brass stamp (200ms
  anticipate-then-press) leaving an embossed APPROVED seal; the audit line writes itself
  beneath in ledger mono. Request-changes opens a margin-note card.
- File versions: a new version slides atop the stack with the prior tab peeking. Timeline
  phases fill a brass rail; the "last updated" stamp presses on each update.
- Targets ≥44px, ≥8px apart. Gestures: **swipe between module cards**, pull-to-refresh the
  front desk — each with a button/tab equivalent. Light haptic on a successful approve
  (native). Agency dashboard: stale portals gently lift 2px once per visit.

## Key screens
1. **Client portal (the artifact, mobile-first):** welcome band → front desk → module
   rooms, as above. Empty room: "Nothing here yet — your team will stock this room."
2. **Agency dashboard (money screen):** vertical portal-card feed with freshness dials and
   view sparklines; a "needs attention" queue up top; one-tap "post an update" composer.
3. **Approval screen:** deliverable preview + the brass stamp flow + audit trail.
4. **Portal composer:** module toggles as switches, template duplication ("copy the
   Meridian setup"), and a live client-view preview one tap away.

## Reduced-motion & fallback
Arrival reveal → lobby appears fully lit with a 120ms fade; no stagger. Stamp → seal and
audit line appear at once. Freshness dials → static with day counts in text. Full theming
is structural and always preserved. Motion collapses to ≤100ms opacity.
