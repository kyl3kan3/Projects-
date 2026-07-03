# CloudSpend — Design Specification

## Design vision
A night-watch observatory over your infrastructure bill. CloudSpend's user is an
engineer who's been burned — so the design is calm vigilance: deep night-sky
surfaces, cost data as *terrain*, and anomalies as weather you can see forming.
The emotional promise rendered visually: someone is watching the horizon while
you sleep, and when something grows out there, you'll know which deploy did it.

## Brand identity

| Role | Color | Hex |
|---|---|---|
| Night sky | `#0C111C` |
| Panel | `#141B2B` |
| Brand | Watch cyan | `#38BDF8` |
| Spend terrain | Steel blue | `#3B4A6B` |
| Anomaly | Flare amber | `#FFB020` |
| Savings | Aurora green | `#34D399` |
| Text | `#E8EDF7` / muted `#8794AD` |

- **Display & UI:** `Geist` (fallback `Inter`); **all money and deltas:** `Geist Mono` tabular — a cloud bill is telemetry.
- **Logo:** a cloud outline whose baseline is a rising cost-curve caught by a watchtower tick. Icon: the cloud-curve on night sky.
- **Voice:** night-watch engineer. "EC2 us-east-1 trending +$340/day since deploy `a1f3c92`. Started 14:20 Tuesday."

## Art direction
- **Cost as landscape:** the core visualization is a terrain — stacked service costs rendered as layered mountain silhouettes receding with atmospheric depth (nearer = bigger spend). Time flows left to right; the "now" line is a thin watch-cyan beacon.
- Deploy markers are flags planted on the terrain — small mono-labeled pennants (`a1f3c92`) at their timestamp; the deploy-correlation thesis is literally staked into the landscape.
- Slack-native design is first-class: alert cards designed *for Slack's renderer* (block kit) with the same terrain-thumbnail, mono figures, and ack buttons — many users will experience CloudSpend mostly inside Slack, so those cards get flagship polish.

## The signature moment — "The Rising Range"
Marketing hero: the cost terrain at night (WebGL — layered extruded silhouettes
with subtle atmospheric fog, a slow parallax drift; ≤ 40k tris). The scene plays
a 20-second incident: the terrain scrolls peacefully — then, just after a deploy
pennant plants itself (`deploy: api-server`), **a new ridge begins to grow** in
one service layer — visibly swelling above its baseline ghost-line (the
seasonal baseline renders as a faint dashed silhouette). At detection threshold,
a flare ignites at the ridge's peak (amber beacon, one pulse), a survey line
drops from the flare to the deploy pennant below — the correlation drawn as
literal surveying — and a Slack alert card slides into the foreground with the
dollar figure counting up (`+$340/day`) and an **Ack** button. Clicking ack (it
works, in the hero) stamps the card and the flare settles to a monitored amber
lamp. Recovery: the ridge erodes back toward baseline and an aurora-green band
sweeps the sky once. The whole pitch — baseline, growth, deploy, detection,
action — in one continuous landscape. Dashboard uses a live 2D-canvas version
of the same terrain grammar.

## Motion system
- **Dashboard terrain (2D):** draws left-to-right on load (800ms); hovering any point raises a plumb-line with the cost breakdown stacking as strata chips; deploy pennants plant with a small stick-in (120ms).
- **Anomaly lifecycle:** open = flare pulse (one) + card in the anomaly rail; ack = stamp press + pulse stops (lamp steady); resolve = the terrain's excess region fills aurora-green at 15% for one sweep, then the anomaly card files itself into history with a drawer slide.
- **Forecast:** month-end projection renders as a dotted ridge continuing beyond "now," recomputing with a gentle morph (400ms `ease-in-out-soft`) when new data lands — never jumpy; forecasts must feel stable.
- **Waste report ("the roast"):** findings deal out as survey tags pinned to their resources, dollar-ranked, each with a one-line remedy in mono; dismissing folds the tag; the total-recoverable figure at top rolls down as findings are actioned — progress you can feel.
- **Onboarding (CloudFormation connect):** a three-step beacon path lights as the role handshake completes (link opened → stack created → first data), ending with the terrain's first draw — data within minutes, staged as dawn.

## Key screens
1. **Marketing hero:** The Rising Range incident scene; beneath, the flat-pricing pledge ("never a % of your bill") etched large, then a real Slack alert-card gallery (our cards, pixel-perfect in Slack frames).
2. **Money screen — The Watch (dashboard):** terrain center, month-to-date + forecast in large mono top-left, anomaly rail right (open flares first), deploy strip beneath the terrain, budgets as altitude lines on the terrain itself (burn-rate warnings when a ridge approaches its line).
3. **Anomaly detail:** the zoomed terrain window around the event, contributor breakdown (usage-type strata), the correlated deploy's metadata, cost-since-start counter (live), and the action log (acks, notes) as a watch log.
4. **Waste report:** the survey-tag list with the recoverable total; monthly "roast" email shares this design in static form.

## Component language
- Buttons: 8px radius, watch-cyan fill with night text; ack buttons always render identically in-app and in Slack (muscle memory across surfaces).
- Cards: panel navy, hairline `#22304A` borders; anomaly cards carry the amber left-rule and mono dollar delta.
- Stat blocks: mono figure + small-caps label + trend tick.
- Empty state: a flat, calm terrain under stars: "Connect an account. We'll take the night watch."

## Reduced motion & fallback
Hero → poster of the flare-and-survey-line moment. Terrain draws → instant with hover plumb-lines intact. Flare pulses → steady lamps. Forecast morphs → stepped updates. Aurora sweep → green badge. All correlations and figures always present as text rows below the terrain.
