# LaunchList — Design Specification

## 1. Vision
LaunchList turns "coming soon" into a growth loop: a launch page, an email capture,
and referral mechanics (position, skip-the-line, milestone rewards) that work out
of the box. Every hosted page is our billboard, so it has to be the best-looking
thing a founder attaches their unlaunched dream to — anticipation with taste, not a
fireworks show.

## 2. Mobile layout (390×844)
Hosted waitlist pages are shared as links and opened overwhelmingly **on phones** —
so the visitor-facing page is the single most important mobile screen in the whole
portfolio.

- **Hosted page (the artifact):** single column. Hero headline + subhead, then the
  email field and one fuel-gradient CTA — **"Join the list"** — above the fold and
  in the thumb zone. After signup the page swaps to the **position state**: a huge
  numeral (`#347`), a "top 12%" line, the share kit (copy link + native share
  sheet), and the reward gates listed. All reachable one-handed.
- **Founder dashboard:** a **bottom tab bar** — Overview · Signups · Referrals ·
  Settings. Overview leads with the signup count (large), a K-factor tile, and a
  live join feed; the primary action **Share / Send blast** sits in the thumb zone.
- **Page builder:** mobile shows a live full-page preview on top and token controls
  (bg, accent, type pair) in a bottom **sheet**; every change animates the preview
  immediately.
- Body ≥16px; position numeral large but legible; targets ≥44px.

## 3. Identity
| Role | Name | Hex |
|---|---|---|
| Base | Pad night | `#0A0E1F` |
| Panel | Panel navy | `#131931` |
| Fuel (gradient) | `#FF6B4A → #FFB020` |
| Ion | Electric violet | `#7C6CFF` |
| Queue | Mint | `#5EEAD4` |
| Text | `#EEF1FB` / muted `#8C93B8` |

- **Display:** `Space Grotesk` 700, tight tracking; queue positions in `Space
  Grotesk` at massive size — `#347` should feel like a stadium seat number.
  **UI:** `Inter`. **Countdowns:** `IBM Plex Mono`.
- **Logo:** an upward arrow whose exhaust trail forms an "L".
- **Signature detail — the position roll.** After signup, and live when a referral
  converts (via socket), the position numeral **rolls upward** — `#347 → #298` —
  with the fuel gradient flashing on the delta and a single soft ring at the
  landing. Big-type odometer, pure DOM/CSS, 60fps on any phone. Founders screen-
  record *this* — it's the growth loop's engine, and it needs no 3D shaft.

## 4. Responsive
The hosted page and builder scale mobile → desktop as a centered single column
(hero content ~65ch); the dashboard gains a persistent side rail and multi-column
tiles ≥1024px. **Optional desktop-only enhancement (hosted page):** the position
can render inside a subtle receding "queue shaft" of tick marks — R3F, lazy behind
a static poster, pointer-only, ≤400KB, never on the mobile path. Mobile always gets
the full-quality big-numeral roll, which is complete on its own.

## 5. Motion & touch
- Shared tokens: signup sequence `ease-out-quart`; counters `spring-gentle`;
  buttons `spring-snappy`.
- **Signup:** the email field's underline ignites left→right (fuel gradient,
  300ms), the button compresses and the confirmation state settles — one clean
  500ms sequence, no confetti.
- **Referral copy:** the link chip lifts a duplicate upward as it copies (240ms) —
  "share it forward."
- **Milestone unlock:** the reward gate's ring completes and irises open (400ms).
- **Starfield** (hero backgrounds only): ≤120 1px stars, opacity twinkle ±15% on
  7s cycles — quiet, and off under reduced motion.
- **Touch:** ≥44px targets; native share sheet on the share button (copy-link is
  the equivalent); pull-to-refresh on the dashboard feed.

## 6. Key screens (mobile-first)
1. **Hosted page (the artifact):** capture above the fold → post-signup position
   state with the roll, share kit, and reward gates.
2. **Founder dashboard (money screen):** signup count, K-factor tile, referral
   leaderboard (top referrer's row faintly shimmering), live join feed.
3. **Page builder:** live full-page preview + token controls in a sheet; the
   builder demos the product by existing.
4. **Marketing hero:** LaunchList's own live waitlist page (dogfooded) with a real
   counter and the roll on signup.

## 7. Reduced-motion & fallback
Position roll → the numeral swaps with a single mint flash; "you're #347 · top 12%"
and reward thresholds always shown as text. Signup ignite → instant confirmation.
Starfield static. Desktop shaft → its static poster. All position math is text-first,
so the loop works with every animation removed.
