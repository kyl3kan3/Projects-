# NetNest Design — "The Vault After Hours"

Art direction anchored in the product's world: a private bank's vault
room after closing — near-black green-tinted dark, linen text, one
vault-green accent, serif numerals that feel engraved. Money UI that
whispers: no confetti, no gamification, no red/green casino ticker.
The Line is the only drama on screen.

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

## Palette

| Token | Hex | Use |
|---|---|---|
| `vaultblack` | `#101512` | App ground (green-tinted near-black) |
| `panel` | `#171D19` | Cards, sheets |
| `line` | `#242B26` | Hairlines only |
| `linen` | `#EFEDE4` | Primary text; primary button fill |
| `dim` | `#98A099` | Secondary text |
| `faint` | `#5C645D` | Tertiary, disabled |
| `vault` | `#35785C` | THE accent: the Line, active states, focus (≤10%) |
| `brass` | `#A98D4B` | Semantic: stale-estimate flags / attention only |
| `clay` | `#B05C4A` | Semantic: reauth needed / sync errors only |

Hard rules: `vault` never fills a button or a surface — it draws the
Line and small marks. `linen` is the only high-emphasis fill
(vaultblack text on it). Debts are NOT red — they are linen numbers
with a minus sign; the casino palette is banned. Dark-only in v1: the
vault has no daytime.

## Type — exact specimen

Faces: **Fraunces** (500/600 — engraved-plate serif for the number
itself) · **Inter** (400/500) for UI · **IBM Plex Mono** (500) for
account balances and dates. All bundled as app assets (expo-font),
loaded before first paint.

| Role | Face/weight | Size/lh | Notes |
|---|---|---|---|
| The Number (net worth) | Fraunces 600 | 40/44 | oldstyle-nums, -0.01em |
| Display (screen titles) | Fraunces 500 | 26/32 | |
| Title (rows) | Inter 500 | 16/22 | |
| Body | Inter 400 | 16/24 | |
| Secondary | Inter 400 | 13/18 | `dim` |
| Placard (labels) | Inter 500 | 11/14 | +0.08em, uppercase |
| Mono (balances/dates) | Plex Mono 500 | 13–15 | tabular-nums |

## Space, radii, hairlines

4px scale. Radii: 12 (cards), 8 (inputs/chips), 999 (dots) — three.
1px `line` hairlines; generous vertical space — the vault is not
crowded. Touch targets ≥ 48px.

## Signature detail — the Line

A single 2px `vault` stroke through monthly close points (3px dots),
drawn on Skia. Between the last close and today, the provisional
segment renders at 40% opacity, 1px — the honest distinction between
closed history and today's estimate. No area fill, no gradient
underneath, no gridline lattice: ticks on the baseline only. The
landing device and the app hero are the same drawing.

## Motion

One signature: **the draw** — on open, the Line draws left to right
600ms `cubic-bezier(0.3, 0, 0.2, 1)` while the Number counts up in the
final 300ms; thereafter the Line never re-animates (respect the
ritual, don't perform it). The monthly-close stamp settles 140ms.
Everything else 120–160ms opacity/transform. Reduced motion: Line and
Number render complete instantly.

## Screens (MVP)

1. **Home (`(tabs)/index`)** — the Number, the Line, range chips
   (1y/3y/all), the provisional-point note ("as of today, unclosed"),
   allocation bars below the fold.
2. **Accounts (`(tabs)/accounts`)** — grouped rows (cash / invested /
   property / debts): institution mark, name, latest balance in Plex
   Mono, staleness flags in `brass`; add flow (Plaid Link or manual).
3. **Close (`(tabs)/close`)** — the monthly ritual: month header,
   account confirm rows (adjust inline), the one-line note field, the
   Close button (linen). Closed months render as a quiet ledger list.
4. **Nest (`(tabs)/nest`)** — household members, plan state, privacy
   controls (export CSV, delete-my-data with its plain-language
   consequence), settings.
5. **Paywall (`paywall`)** — the honest wall: what free includes, what
   Plus adds, the Plaid-cost sentence ("bank connections cost us real
   money — that's the cap"), RevenueCat purchase buttons, restore.
6. **Web landing (server/)** — vault world, the phone-frame device
   drawing the Line (see README), the privacy page AS a feature
   section, pricing, App Store badges. CTA verbatim: "Get NetNest
   free".

## Empty / loading / error

First-run: the Line area shows a single dot ("Add your first account
— the line starts here"). Loading = the cached render (never a
spinner over money). Reauth/sync errors are calm `clay` rows naming
the institution and the fix, never a full-screen alarm.
