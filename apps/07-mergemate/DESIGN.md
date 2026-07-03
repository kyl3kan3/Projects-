# MergeMate — Design Specification (v3, redline level)

## Vision
A senior engineer's desk lamp at midnight: dark editor chrome, GitHub-native
restraint, one personality trait — surgical precision. Every finding looks
placed with tweezers, never sprayed from a hose. PR blue is the single
signature and it is rationed like the comments are. Silence is a feature, and
the design says so out loud.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `editor` | `#0D1117` | The ground. Every screen. |
| `panel` | `#161B22` | Sheets, code wells, finding cards only |
| `hairline` | `#262C36` | 1px dividers & card borders — never brighter |
| `text` | `#E6EDF3` | Primary text |
| `text-2` | `#8B949E` | Secondary text |
| `text-3` | `#565E68` | Faint (timestamps, placeholders) |
| `paper` | `#F0F3F6` | **Primary buttons** (editor text on it) |
| `pr-blue` | `#3E7BD6` | THE accent. ≤10% of any screen: active tab, confidence segments, focus rings, the merge-node motif, links |
| `diff-green` | `#3FB950` | Diff additions / applied only |
| `diff-red` | `#F85149` | Diff deletions / failed only |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: pr-blue never fills a button or a surface; `paper` is the only
high-emphasis fill; diff colors appear exclusively inside diffs and their
outcomes — never as decoration. GitHub-adjacent values on purpose: devs must
feel at home in one glance. Single dark world; no light theme at v1.

## Type — exact specimen

Faces: **Inter** (400/500/600) for UI · **JetBrains Mono** (400/500,
**ligatures off** — diff fidelity beats prettiness) for all code, diffs, rule
IDs, and figures. Both self-hosted woff2, preloaded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (marketing hero) | Inter 600 | `clamp(32px, 8.5vw, 56px)` / 1.1 | −0.02em |
| H2 (screen title) | Inter 600 | 22 / 1.2 | −0.01em |
| Title (finding one-liner) | Inter 600 | 16 / 1.35 | 0 |
| Body | Inter 400 | 16 / 1.55 | 0 |
| Secondary | Inter 400 | 13 / 1.45 | 0 |
| Label | Inter 600 | 11 / 1.2 | +0.08em, uppercase |
| Code / diff | JBM 400 | 13 / 1.5 | 0 |
| Data (file:line, rule ID, stats) | JBM 500 | 12 / 1.3 | 0, tabular figures |
| Button | Inter 600 | 15 / 1 | 0 |

`src/auth/session.ts:114` and `rule:no-raw-sql@v12` always render in JBM 500.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **8** (controls: buttons, inputs, chips) · **12** (finding cards,
  code wells) · **16** (sheets). Nothing else.
- Elevation: none. Depth is `panel` vs `editor` and hairlines; code wells
  recess via `#0A0E14` fill, not shadow.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `reviews` (comment-check), `repo` (book), `rulebook`
(sliders), `account` (user), `merge-node` (branch dot), `file-code`,
`diff` (±), `check`, `x-dismiss`, `shield` (security finding), `bug`,
`gauge` (confidence), `chevron-down`, `link`, `plus`. Nav renders at 22px,
inline at 18px. **No emoji, anywhere, ever** — severity is a Label chip
("SECURITY"), never a warning-sign emoji.

## Component construction (exact)

- **Primary button (Apply patch):** paper fill, editor text, radius 8, height
  48 mobile (full-width in thumb zone), Inter 600 15. Press: scale 0.98 +
  fill `#DDE3E9`. Disabled: `#21262E` fill, `text-3` text.
- **Secondary (Dismiss):** transparent, 1px hairline, `text`. Press: border
  `#333B45`.
- **Quiet action:** text-only, pr-blue, no underline; press dims to 80%.
- **Input:** editor fill, hairline border, radius 8, height 48, 16px text.
  Focus: border pr-blue + 2px offset ring at 25% pr-blue.
- **Rule chips:** height 28, radius 8, hairline, JBM 12 rule ID
  ("`no-raw-sql`"); tappable → rule detail.
- **Finding cards:** `panel` fill, hairline border, radius 12, 2px pr-blue
  left rule, padding 16. Anatomy top-down: JBM `file:line` + rule chip row;
  confidence meter; Title defect one-liner; suggested patch in a recessed
  well (`#0A0E14`, radius 8, JBM 13, red/green diff lines); Apply/Dismiss
  row. One card per finding — never a wall.
- **Confidence meter:** five 16×6px segments, 4px gaps, radius 2. Filled =
  pr-blue; below-threshold segments render as **empty sockets** (hairline
  outline only) — the low-noise stance made visible. JBM value right ("`0.91`").
- **List rows (repos, rulebook rules):** NO boxes. Hairline rows ≥56px:
  Title, JBM meta ("`214 PRs · 0.4 comments/PR`"), toggle or chevron right.
- **PR summary bar:** hairline row pinned atop the feed: merge-node glyph +
  "This PR: 2 findings" or pr-blue node + "Passed clean. That's the point."
- **Bottom tab bar:** height 56 + safe-area, `panel` at 94% + blur, hairline
  top. Four items, 22px icons + 10px labels; active = `text` + 2px pr-blue
  dot; inactive = `text-3`.

## The signature — the confidence meter (kept, refined)
Beside every finding, the 5-segment bar fills left→right, 60ms per segment,
`ease-out-quart`, the final segment landing with `spring-snappy` when
confidence clears the threshold. Below-threshold candidates (dashboard only)
show their empty sockets and never fill. The whole product philosophy in one
60fps component — no scan-field, no WebGL. Everything else is state feedback
≤240ms.

## Mobile layout (390×844 — primary spec)
- **Findings feed:** gutter 20. PR summary bar ("fix: session refresh race —
  #482 · This PR: 2 findings"), then finding cards single column. Real
  content: "`src/auth/session.ts:114`" + chip "`no-raw-sql`" + meter 5/5 +
  "String-interpolated SQL in `getSession`; use the parameterized helper."
  with a 6-line patch well. **Apply patch** primary + **Dismiss** secondary
  in the thumb zone of each card.
- **Finding detail:** defect, evidence (linked transcript of the diff hunk),
  full patch, and the audit line in JBM: "`rule no-raw-sql · rulebook v12 ·
  fired 2026-07-03`".
- **Rulebook:** read-focused `.mergemate.yml` viewer (JBM 13, horizontal
  scroll in its own track), per-rule hairline rows with on/off toggles and
  JBM fire-counts ("`fired 8× / 30d`").
- **Noise dashboard:** Label "COMMENTS PER PR (median)", a JBM headline
  "`2.1`", and a 12-week trend line (1.5px pr-blue) drifting down — the
  screenshot a champion sends their lead.

## Responsive
≥768px: feed + finding detail become two panes, gutters 32. ≥1024px: rulebook
editor gains a live-preview pane ("this config would have raised 3 findings
on the last 5 PRs"); left rail replaces the tab bar; max width 1280. The
marketing hero's "gauntlet" scan stays desktop-only behind a static poster;
on phone the hero is a real PR screenshot with exactly two comments — the
restraint demo.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Finding cards enter `spring-gentle` from 8px
below, one at a time — even the choreography argues restraint. Patch apply:
red lines compress out, green lines expand in (height auto-animate, 240ms
`ease-in-out-soft`), then a pr-blue check draws (300ms stroke). Rulebook
toggle: mono on/off tile swap + 150ms preview crossfade. Targets ≥44px;
Apply/Dismiss in the thumb zone. Swipe a card to dismiss — it collapses to a
24px receipt row ("Dismissed — won't repeat this pattern") at 60% opacity
(also a Dismiss button). Native haptic on apply; web silent.

## Reduced motion & fallback
Confidence fill → instant segment states. Patch animation → instant diff
swap. Stroke-drawn checks → instant checkmark. Card entrances → ≤100ms fade.
Hero → static caught-line poster. Confidence values and dismissals are always
stated in text, never motion-only.
