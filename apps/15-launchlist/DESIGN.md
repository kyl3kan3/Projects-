# LaunchList — Design Specification (v3, redline level)

## Vision
LaunchList turns "coming soon" into a growth loop: a launch page, an email
capture, and referral mechanics that work out of the box. Every hosted page
is our billboard, so it must be the best-looking thing a founder attaches
their unlaunched dream to — anticipation with taste, not a fireworks show.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load. The v2 "fuel gradient" is dead: no gradient
ever touches a button or the position numeral.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `night` | `#0A0E1F` | The ground. Hosted pages and dashboard. |
| `panel` | `#141A33` | Framed objects only: the reward-gate card, builder preview frame |
| `hairline` | `#232B4D` | 1px dividers & card borders — never brighter |
| `text` | `#EEF1FB` | Primary text |
| `text-2` | `#8C93B8` | Secondary text |
| `text-3` | `#585F88` | Faint (locked gates, placeholders) |
| `paper` | `#F2F4FC` | **Primary buttons** (ink `#0A0E1F` text), the position numeral |
| `flare` | `#E8654F` | THE accent. ≤10% of any screen: brand mark, active states, the roll's delta flash, the ignite underline, links |
| `mint` | `#4BD8BE` | Semantic: success only (signup confirmed, reward unlocked) |
| `red` | `#E5484D` | Semantic: errors only (invalid email, fraud flag) |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: flare never fills a button or a surface (the v2 gradient CTA is
replaced by `paper`); mint appears only at confirmation moments; founder
theme tokens on hosted pages may recolor `flare` and the ground, never the
button construction.

## Type — exact specimen

Faces: **Space Grotesk** (500/700) for display and the position numeral ·
**Inter** (400/500/600) for UI · **IBM Plex Mono** (500) for counts and
countdowns. All Google-Fonts-loadable, self-hosted/embedded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (hero headline) | SG 700 | `clamp(32px, 9vw, 56px)` / 1.06 | −0.02em |
| Position numeral | SG 700 | `clamp(64px, 18vw, 96px)` / 1.0 | −0.02em, tabular figures |
| H2 | SG 700 | 24 / 1.15 | −0.01em |
| Title (row/card) | Inter 600 | 16 / 1.3 | 0 |
| Body | Inter 400 | 16 / 1.55 | 0 |
| Secondary | Inter 400 | 13 / 1.45 | 0 |
| Label | Inter 600 | 11 / 1.2 | +0.08em, uppercase |
| Data (counts, K-factor) | IPM 500 | 13 / 1.2 | 0, tabular figures |
| Button | Inter 600 | 15 / 1 | 0 |

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **10** (controls: buttons, inputs, chips) · **14** (framed cards:
  reward gates, preview frame) · **20** (sheets). Nothing else.
- Elevation: none. Depth is `panel` vs `night` and hairlines; only the sheet
  scrim shadows.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `arrow-up` (brand: arrow + trail stroke), `mail`, `link`,
`copy`, `share`, `users`, `trophy` (leaderboard), `gift` (reward), `lock`
(gated tier), `unlock`, `chart`, `funnel`, `send` (blast), `settings`,
`chevron-left`, `plus`, `check`, `x`, `flag` (fraud review). Dashboard tab
bar renders at 22px, inline at 18px. **No emoji, anywhere, ever** — no
rocket, no fire; the brand mark is the drawn ascent arrow.

## Component construction (exact)

- **Primary button:** `paper` fill, `#0A0E1F` text, radius 10, height 52
  (full-width in thumb zone), Inter 600 15. Press: scale 0.98 + fill
  `#DFE3F1`. Disabled: `#262E52` fill, `text-3` text. Never flare-filled,
  never gradient — on every founder theme.
- **Secondary:** transparent, 1px hairline, `text` label. Press: border
  `#2E3760`.
- **Quiet action:** text-only flare; press dims to 80%.
- **Email input (the product's most important control):** `night` fill,
  hairline border, radius 10, height 52, 16px text; focus: border flare +
  2px offset ring at 25% flare. Inline with the button ≥480px, stacked below
  it never (input first, always).
- **Share-link chip:** height 44, radius 10, hairline, IPM 13 URL truncated
  middle + `copy` glyph; copied state swaps glyph to mint `check` for 1.2s.
- **Reward-gate cards:** the app's framed objects — `panel`, hairline,
  radius 14, padding 16: `gift` glyph, Title ("Early access"), Label
  (`3 REFERRALS`), a 2px progress rule underneath (flare fill on hairline
  track). Locked gates: `lock` glyph, `text-3` throughout.
- **Leaderboard / signup rows:** NO boxes. Full-bleed hairline rows, 56px:
  IPM rank (`04`), name/email (Title 16), IPM referral count right. Top
  referrer's rank numeral is flare — the row is otherwise identical.
- **Founder tab bar:** height 56 + safe-area, `night` 94% + blur, hairline
  top. Overview / Signups / Referrals / Settings, 22px icons + 10px labels.
  Active = `text` + 2px flare dot; inactive = `text-3`.

## The signature — the position roll
After signup, and live when a referral converts (socket push), exactly: the
position numeral rolls upward digit-by-digit — `#347 → #298` — as a big-type
odometer, 500ms `ease-out-quart`, digits tinted flare while in motion and
settling to `paper` at rest; a delta chip (`▲ 49`, IPM 13, flare text, no
fill) fades in above for 1.2s; at landing, one 1.75px flare ring expands
from the numeral's baseline (500ms, opacity 50% → 0, once). Pure DOM/CSS
transforms, 60fps on any phone. Founders screen-record *this* — it needs no
3D shaft.

## Mobile layout (390×844 — primary spec)
- **Hosted page (the artifact):** gutter 20, single column. Founder's
  wordmark, Display headline ("Ledgerly — bookkeeping that closes itself"),
  one Body subhead, then the email input + primary **Join the waitlist** in
  the thumb zone; beneath, Label proof line `2,847 PEOPLE AHEAD OF NO ONE —
  JOIN THEM` set in `text-2`. Free tier shows a quiet "Powered by
  LaunchList" hairline footer row (Label type, `text-3`).
- **Position state (post-signup):** the numeral `#347`, "top 12%" in
  Secondary, the share kit — share-link chip + native-share primary button —
  and the reward gates stacked: Early access (3 referrals, `1/3`), Founding
  price (10), Lifetime deal (25, locked).
- **Founder dashboard — Overview:** signup count `2,847` (SG 700 40) with
  IPM `+118 TODAY`, a K-FACTOR tile (`1.34`) and CONVERSION tile (`38%`)
  divided by hairlines, then the live join feed as hairline rows
  (`m***@gmail.com · via @sofia · 2m ago`). Primary **Send launch blast**
  in the thumb zone.
- **Page builder:** live full-page preview in the `panel` frame (radius 14)
  up top; token controls (ground, accent, type pair, headline) in a bottom
  sheet (radius 20, grab handle 40×4); every change animates the preview in
  ≤200ms.

## Responsive
Hosted page stays a centered single column at every size (hero ~65ch,
max 640px) — it must look composed in a tweet screenshot. Dashboard ≥1024px:
left rail replaces the tab bar, tiles go 4-across, leaderboard and feed sit
side-by-side; max width 1200. **Optional desktop-only enhancement (hosted
page):** the numeral backed by a receding shaft of hairline tick marks —
static SVG, parallax ≤8px on scroll, no WebGL, nothing on the mobile path.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Signup: the input's 2px underline ignites
left → right in flare (300ms) as the button compresses; confirmation settles
in one 500ms sequence — no confetti, ever. Copy: the chip's URL lifts 8px
and fades as the check lands (240ms). Milestone unlock: the gate's progress
rule completes, the `lock` swaps to `unlock` with a 200ms stroke draw, mint
check beside it. Reward gates enter with 12px rise, `spring-gentle`, 30ms
stagger ≤4. Targets ≥44px; native share sheet with copy-link equivalent;
pull-to-refresh on the dashboard feed.

## Reduced motion & fallback
Position roll → the numeral swaps with a single mint flash (100ms); delta
still shown as the `▲ 49` chip in text. Ignite underline → instant focus
ring. Gate unlock → state swap. All position math ("You're #347 · top 12% ·
2 more referrals to Early access") is always present as text, so the loop
works with every animation removed.
