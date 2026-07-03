# LaunchList — Design Specification

## Design vision
Launch night, bottled. LaunchList sells anticipation — the queue, the countdown,
the climb — so the design is a night launchpad: deep space navy, sunset-fuel
gradients, and a physics-real rocket that responds to the crowd. It must be the
best-looking thing a founder attaches their unlaunched dream to; every hosted
page is our billboard, so restraint and spectacle have to coexist.

## Brand identity

| Role | Color | Hex |
|---|---|---|
| Pad night | `#0A0E1F` |
| Panel | `#131931` |
| Brand gradient | Fuel | `#FF6B4A → #FFB020` |
| Ion | Electric violet | `#7C6CFF` |
| Queue mint | `#5EEAD4` |
| Text | `#EEF1FB` / muted `#8C93B8` |

- **Display:** `Space Grotesk` 700 with tight tracking; hero numerals (queue positions, counts) in `Space Grotesk` at massive sizes — position #347 should feel like a stadium seat number.
- **UI:** `Inter`. **Countdowns:** `IBM Plex Mono`.
- **Logo:** an upward arrow whose exhaust trail forms an "L". Icon: the arrow-L on fuel gradient.
- **Voice:** launch-control hype with taste. "You're #347. Bring 3 friends, jump 900 spots."

## Art direction
- Fuel gradient is sacred: used only on the primary CTA, position deltas, and the rocket's exhaust — never backgrounds.
- Starfield backgrounds: 2 parallax layers of 1px stars (max 120 stars, twinkle by opacity ±15% on 7s randomized cycles).
- **Hosted pages are themeable** but ship with this identity as the flagship template; the builder exposes tokens (bg, accent gradient, type pair) while preserving the motion system — our craft travels with every embed.

## The signature moment — "The Climb"
On a hosted waitlist page, after signup: the visitor's **queue position renders
as a vertical shaft** — a 3D column of tick marks receding up into darkness
(R3F, fog), their marker glowing at position N. When a referral converts (live
via socket), the shaft *moves*: the camera and marker surge upward past ticks
(distance proportional to the boost, 900ms `ease-anticipate` — a brief dip, then
the surge), numbers blur-rolling down (`#347 → #298`), a faint sonic-ring at
apex, exhaust particles trailing below the marker. Milestone rewards float in
the shaft at their thresholds as glowing gates — you can *see* early-access
sitting 40 spots above you. Idle state: the shaft breathes with slow fog drift.
Founders share screen-recordings of this moment; it is the growth loop's engine.

## Motion system
- **Signup:** the email field's underline ignites left→right (fuel gradient, 300ms), the button compresses (`ease-anticipate`) and *launches* upward out of its slot as the confirmation state lands — one clean 500ms sequence, no confetti.
- **Referral link copy:** the link chip duplicates itself upward with a fade (the "share it forward" metaphor), 240ms.
- **Founder dashboard counters:** signups tick with odometer rolls; the K-factor gauge needle moves with `spring-gentle`; a live feed shows joins as small capsules docking into a column.
- **Milestone unlock:** the reward gate's ring completes and irises open (400ms), releasing one pulse down the shaft to all markers below (they bob 4px).
- **Launch-day blast send:** the send button initiates a 3-2-1 mono countdown (600ms/digit, skippable) then the email icon streaks off with an exhaust line — theatrical exactly once, where it's earned.

## Key screens
1. **Marketing hero:** a live LaunchList page for LaunchList itself (dogfooding as design): real position counter, real shaft demo on signup; below, template gallery as three lit launchpads.
2. **Page builder:** left = live hosted-page preview (full motion), right = token controls; every control change animates the preview immediately — the builder demos the product by existing.
3. **Money screen — Founder dashboard:** signups curve (draws on load), referral leaderboard with the top referrer's row carrying a subtle exhaust shimmer, sources donut, and the live join feed.
4. **Hosted page (the artifact):** hero copy + email capture above the fold; post-signup swaps to The Climb + referral kit (link, share buttons, reward gates listed).

## Component language
- Buttons: 12px radius; primary = fuel gradient with navy text; secondary = violet outline. Hover lifts 1px with gradient shift +10° hue.
- Cards: panel navy, 16px radius, starfield permitted only behind hero cards.
- Position badges: mono, mint, with ▲ deltas in fuel gradient.
- Empty state (dashboard): an unlit pad with a single spotlight: "Your list is armed. Share the link."

## Reduced motion & fallback
Shaft → static position card with "you're #347 · top 12%" and reward thresholds listed; boosts update numbers with a mint flash. Countdown → instant send with confirmation. Starfield static. All position math always in text.
