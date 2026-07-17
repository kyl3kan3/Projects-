# CertShield Design — "The Underwriter's File"

Art direction anchored in the product's world: an underwriter's desk —
cool gray file stock, precise rules, a gold embosser used only where
something is certified. The UI reads like well-kept files: dense
tabular certainty, statuses as stamped verdicts, the one gold seal
reserved for COMPLIANT. Sober, exact, quietly expensive.

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

## Palette

| Token | Hex | Use |
|---|---|---|
| `stock` | `#F1F2F0` | App ground (file stock) |
| `sheet` | `#FAFBF9` | Cards, panels |
| `line` | `#D9DCD6` | Hairlines, table rules |
| `ink` | `#1F2422` | Primary text; primary button fill |
| `dim` | `#68706B` | Secondary text |
| `faint` | `#9AA29C` | Tertiary, disabled |
| `seal` | `#C0912F` | THE accent: the compliant seal, active states (≤10%) |
| `claim` | `#A4453A` | Semantic: deficient / expired / lapsed only |
| `pending` | `#8A7B4F` | Semantic: expiring / needs-review only |

Hard rules: `seal` never fills a button or a surface — it is the
compliance seal, focus rings, and small marks. `ink` is the only
high-emphasis fill (stock text on it). `claim` red-browns speak only
for failed compliance. Light-only: files live under office light.

## Type — exact specimen

Faces: **Libre Franklin** (400/500/600 — the American-document
grotesk; forms and filings, zero startup flavor) for display and UI ·
**IBM Plex Mono** (500) for limits, policy numbers, and dates. Both
self-hosted woff2, preloaded.

| Role | Face/weight | Mobile size/lh | Notes |
|---|---|---|---|
| Display | Libre Franklin 600 | 30/36 | -0.01em |
| H2 | Libre Franklin 600 | 22/28 | |
| Title (row) | Libre Franklin 500 | 16/22 | |
| Body | Libre Franklin 400 | 16/24 | |
| Secondary | Libre Franklin 400 | 13/18 | `dim` |
| Placard (verdict) | Libre Franklin 600 | 11/14 | +0.08em, uppercase |
| Mono (limits/policies/dates) | Plex Mono 500 | 13–15 | tabular-nums |

## Space, radii, hairlines

4px scale. Radii: 8 (cards/inputs), 6 (chips), 2 (table cells) —
three. 1px `line` hairlines; the coverage matrix is ruled both axes
like a filing form. Touch targets ≥ 44px.

## Signature detail — the compliance seal

A 20px ring in `seal` with a short inner tick, stamped beside a vendor
when their engagement evaluates COMPLIANT — the only gold on the
screen. Deficient rows carry no icon: they carry the sentence
("GL each-occurrence $500,000 is below the required $1,000,000") set
in `claim`. Verdicts are prose, not iconography — the sentence is the
product.

## Motion

One signature: **the seal press** — on a verdict flipping to
compliant, the ring scales 1.15 → 1.0 with a 140ms settle, like an
embosser landing. Deficiency sentences slide in 120ms from 4px below.
Everything else 120–160ms opacity/transform. Reduced motion: final
states.

## Screens (MVP)

1. **Dashboard (`/dashboard`)** — the portfolio rollup: compliant /
   deficient / expiring / expired counts as plain numbers, the
   this-month lapse list, the review queue count. No donut charts —
   files, not dashboards.
2. **Vendors (`/vendors`)** — rows: name, trade, engagement count,
   verdict placard + seal where earned; filters by status/trade.
3. **Vendor detail** — engagements with per-property verdicts and the
   deficiency sentences; certificate history (immutable PDFs, hashes);
   the chase timeline (what was sent when, to whom).
4. **Review queue (`/review`)** — split view: ACORD PDF left, parsed
   fields right with confidence; low-confidence fields underlined
   `pending`; confirm advances to evaluation.
5. **Requirement templates (`/requirements`)** — line editor (coverage,
   label, minimum) + flags; template changes preview which engagements
   would flip verdicts BEFORE saving (the blast-radius preview).
6. **Vendor upload portal (`/v/[token]`)** — one job: drop the PDF.
   States: received → parsing → "your certificate is under review" /
   the deficiency sentence if it fails. Plain language for an
   insurance agent's assistant.
7. **Binder export** — per property: the compliance matrix + every
   current certificate, one PDF.
8. **Landing** — file-stock world, the parse-and-verdict device (see
   README), a chase timeline receipt, pricing, honest FAQ (what we
   parse, what a human reviews). CTA verbatim: "Start free — 14 days".

## Empty / loading / error

Empty states name the next action ("Import vendors from CSV, then send
upload links"). Loading = skeleton table rows. Parse failures always
show the stored PDF and offer manual entry — the file never bounces.
