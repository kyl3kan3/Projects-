# MergeMate — Design Specification

## Design vision
A senior engineer's desk lamp at midnight: dark editor chrome, syntax-color
accents, and an air of quiet competence. MergeMate must feel like it was designed
*by* the tools developers already trust — GitHub-native restraint — but with one
unmistakable personality trait: surgical precision. Every finding looks like it
was placed with tweezers, never sprayed from a hose.

## Brand identity

| Role | Color | Hex |
|---|---|---|
| Editor black | `#0D1117` |
| Panel | `#161B22` |
| Brand | Merge violet | `#A371F7` |
| Additions | Diff green | `#3FB950` |
| Deletions | Diff red | `#F85149` |
| Info | PR blue | `#58A6FF` |
| Text | `#E6EDF3` / muted `#8B949E` |

- **UI:** `Inter`; **all code, diffs, rule IDs:** `JetBrains Mono` with ligatures off (diff fidelity beats prettiness).
- **Logo:** two git branch lines converging into one, forming an "M"; the merge point is a violet node that pulses on the marketing site. Icon = the merge-node alone.
- **Voice:** senior reviewer, brief and specific. "Off-by-one in pagination cursor. High confidence. Suggested patch below." Never chirpy, never robotic.

## Art direction
- Deliberately GitHub-adjacent surfaces (devs should feel at home instantly) but with a violet signature: focus rings, the merge-node motif, and finding markers are all violet.
- Density is a feature: 13px mono in diffs, tight 1.45 line-height, information-first.
- The **confidence meter** is a core visual: a small horizontal 5-segment bar next to every finding; low-noise mode is *visible* — segments below threshold render as empty sockets.

## The signature moment — "The Gauntlet"
Marketing hero: a raw diff (real-looking code, scrolling slowly upward like
credits) passes through a horizontal **violet scan-field** across the viewport
(GLSL refraction band that slightly magnifies lines as they cross). Most lines
pass clean. Occasionally the field *catches* a line: time dilates (scroll slows
to 0.2× for 600ms), the line lifts 8px out of the diff with a violet edge-light,
a finding card assembles beside it (rule ID types itself, confidence segments
fill, suggested patch slides in as a green diff), then the line re-seats and flow
resumes. The rhythm — long calm, brief precision strike — *is* the low-noise
pitch. 2D/WebGL hybrid; poster fallback shows one caught line.

## Motion system
- **Finding cards** enter with `spring-gentle` from 8px below, one at a time (never a wall of comments — even the animation argues restraint).
- **Confidence fill:** segments fill left→right, 60ms each, with the last segment landing hard (`spring-snappy`) when confidence is high.
- **Suggested patch apply:** the red lines compress out, green lines expand in (height auto-animate, 240ms `ease-in-out-soft`), then a violet check-run tick draws.
- **Check-run status (marketing + docs):** the classic dots → spinner → check sequence, but the check draws as a single 300ms stroke — the moment devs learn to love.
- **Rulebook editor:** toggling a rule flips a mono `on/off` split-flap tile; the rule's example finding preview updates live with a 150ms crossfade.

## Key screens
1. **Marketing hero:** The Gauntlet; beneath, a real PR screenshot with exactly *two* MergeMate comments (the restraint demo), each expandable; stats band: "Median 1.7 comments per PR. 92% accepted."
2. **Install & config:** GitHub-app flow restyled — repo list with violet merge-nodes, `.mergemate.yml` editor with live-preview pane showing which findings the current config would have raised on the repo's last 5 PRs.
3. **Money screen — Findings dashboard:** per-repo review feed; each finding row = file:line (mono), rule chip, confidence sockets, accepted/dismissed state; the top band shows "noise ratio" trending down over weeks — the graph the champion screenshots for their team lead.

## Component language
- Buttons: GitHub-scale (28px), 6px radius; primary violet, secondary panel-outline.
- Finding cards: 1px `#30363D` border, violet 2px left rule, code in a recessed well.
- Empty state: a diff with zero comments and a small violet node: "This PR passed clean. That's the point."
- Dismissal: swipe/click collapses the card to a 24px receipt line ("dismissed — won't repeat this pattern") that fades to 60%.

## Reduced motion & fallback
Gauntlet → static caught-line poster. Time dilation removed; findings appear with 80ms fades. Split-flaps → text swap. Stroke-drawn checks → instant checkmark.
