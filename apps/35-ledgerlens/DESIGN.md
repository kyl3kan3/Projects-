# LedgerLens — Design Specification (v5, redline level)

## Vision
A bookkeeper's ruled ledger, photographed in good daylight. LedgerLens turns a
glovebox of thermal paper into entries a professional will sign off on, so the
interface is warm paper stock, ink typography, mono figures, and one ledger
green that appears only where a number has been confirmed as true. Nothing
celebrates; the row being *ruled off* is the reward.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `stock` | `#F7F6F1` | The ground. Every screen — warm ledger paper |
| `card` | `#FCFBF7` | Document cards, review sheets, close-package panel only |
| `hairline` | `#E5E3D8` | 1px dividers & panel borders — never darker |
| `ink` | `#20261F` | Primary text AND primary button fill |
| `ink-2` | `#6B7166` | Secondary text |
| `ink-3` | `#9AA093` | Faint (timestamps, placeholders, watermarks) |
| `ledger` | `#2E7D5B` | THE accent. ≤10% of any screen: confirmed figures, the settle rule, links, active states, focus rings |
| `flag` | `#B98A2C` | Needs-review / low-confidence only |
| `red` | `#B4453A` | Rejected / duplicate / failed extraction only |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: `ledger` never fills a button or a surface; `ink` is the only
high-emphasis fill (paper text on it); `flag`/`red` appear only where they mean
review or rejection. Committed to the single light world — a receipt is read in
daylight; there is no dark theme in v1, by choice.

## Type — exact specimen

Faces: **Public Sans** (400/500/600) for UI · **IBM Plex Mono** (500/600) for
every figure, date, and total. Both self-hosted woff2, preloaded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (marketing hero) | PS 600 | `clamp(32px, 8.5vw, 54px)` / 1.08 | −0.015em |
| Hero stat (month total) | IPM 600 | `clamp(36px, 10vw, 56px)` / 1.05 | −0.01em, tabular; cents 60% size |
| H2 (screen title) | PS 600 | 22 / 1.2 | −0.01em |
| Title (row/vendor) | PS 600 | 16 / 1.3 | 0 |
| Body | PS 400 | 16 / 1.55 | 0 |
| Secondary | PS 400 | 13 / 1.45 | 0 |
| Label | PS 600 | 11 / 1.2 | +0.08em, uppercase |
| Data / money / dates | IPM 500 | 13 / 1.2 | 0, tabular figures |
| Button | PS 600 | 15 / 1 | 0 |

All money is mono tabular, always. A confirmed total renders in `ledger`;
unconfirmed totals render in `ink` with a `flag` dot beside them.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **8** (controls: buttons, inputs, chips) · **12** (document cards,
  review sheets) · **20** (bottom sheets, image viewers). Nothing else.
- Elevation: none. Depth is `card` on `stock` plus hairlines. Only the sheet
  scrim shadows; document thumbnails get a 1px hairline, never a drop shadow.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `inbox-tray` (inbox), `camera` (capture), `flag-small`
(review), `book-closed` (close package), `gear` (settings), `mail-in`
(forwarded), `check`, `pencil` (correct), `copy-two` (duplicate), `download`,
`link` (share), `chevron-right`, `plus`, `rule-off` (short horizontal stroke
with a check — the confirm action). Nav renders at 22px, inline at 18px.
**No emoji, anywhere, ever** — a confirmed entry gets `rule-off`, not a
green check-mark emoji.

## Component construction (exact)

- **Primary button:** `ink` fill, `stock` text, radius 8, height 48 mobile
  (full-width in thumb zone), PS 600 15. Press: scale 0.98 + fill `#2B332A`.
  Disabled: `#D6D4C8` fill, `ink-3` text.
- **Secondary:** transparent, 1px hairline, `ink`. Press: border `#CFCDBF`.
- **Quiet action:** text-only, `ledger`, no underline; press dims to 80%.
- **Input:** `card` fill, hairline border, radius 8, height 48, 16px text.
  Focus: border `ledger` + 2px offset ring at 25% ledger.
- **Chips (period filter: This month / Last month / Quarter):** height 36,
  radius 8, hairline; active = `ledger` 1px border + `ledger` text.
- **Document row:** NO boxes in the inbox list. Full-bleed rows ≥64px, hairline
  between: 40×40 thumbnail (radius 8, hairline), Title(16) vendor, mono amount
  right, Secondary source line ("forwarded · Mar 12") in `ink-3`. Status at
  left edge: `flag` 6px dot = needs review, `ledger` short rule = confirmed.
- **Review sheet:** `card`, radius 12, padding 16. Source image on top in its
  own `overflow` viewer (pinch-zoom); extracted fields below as Label + value
  pairs. Low-confidence fields get a `flag` left border (2px) and mono
  confidence ("total · 61%"). Tapping a value shows the source crop it came
  from — provenance is a feature, draw it.
- **Confidence meter:** none. Confidence is a number and a flag, never a
  gauge or a colored bar — this is bookkeeping, not a dashboard.
- **Status pill:** height 28, 6px dot + Label(11): `flag` "NEEDS REVIEW",
  `ledger` "CONFIRMED", `red` "DUPLICATE".
- **Close-package panel:** `card`, radius 12: Label "MARCH CLOSE", mono totals
  table (category left, amount right, hairline rows), then three download rows
  (PDF summary / CSV exports / source images) with `download` glyphs.
- **Bottom tab bar:** height 56 + safe-area, `card` at 96% + blur, hairline
  top. Four items at 22px icons + 10px PS 600 labels: inbox-tray / camera /
  book-closed / gear; active = `ink` + 2px `ledger` dot; inactive = `ink-3`.

## The signature — the settle rule
When an entry is confirmed (auto at high confidence, or by tap in review), a
1.5px `ledger` rule draws left→right beneath the row in 280ms `ease-out-quart`
— a bookkeeper ruling off the line — while the amount crossfades from `ink` to
`ledger` over the same beat. Simultaneously the header's "Reviewed" count ticks
up one (single digit roll, ≤300ms, `spring-gentle`). Batch confirms stagger
24ms, max 8 visible rules per beat. This is the entire brand animation — no
confetti, no checkmark pop, no glow. Everything else is state feedback ≤240ms.

## Mobile layout (390×844 — primary spec)
- **Inbox (home):** gutter 20. Top: Label "MARCH" + mono month total
  `$4,182.66` (hero stat), beneath it Secondary "31 documents · 3 need review"
  with `flag` dot. Then chip row (All / Needs review / Confirmed), then the
  document rows, newest first. Primary button **Add receipt** (opens camera)
  pinned above the safe-area; forwarding address shown in the empty state
  ("Forward any invoice to docs+acme@in.ledgerlens.app").
- **Review:** one review sheet per screen, swipe or arrows between flagged
  documents; accept = full-width primary, correct = inline field edit. After
  the last item: "Inbox clear" state with the month total and a quiet
  `ledger` rule under it.
- **Capture:** full-bleed camera, shutter ≥64px in thumb zone, gallery pick
  at left. Post-shot: crop hint overlay, Retake / Use photo. Blurry warning
  appears before upload, not after extraction.
- **Close (book-closed tab):** period list as hairline rows (mono period,
  status pill, chevron); tapping opens the close-package panel. If items
  block the close: `flag` banner "3 items need review before March closes"
  deep-linking the queue.
- **First run:** two setup cards only — "Forward an email" (address with
  copy button) and "Photo a receipt" (opens camera). The first extracted
  document replaces the cards with the real inbox.

## Responsive
≥768px: inbox becomes a two-pane split — rows left, review sheet right;
gutters 32. ≥1024px: left rail replaces the tab bar; close packages render as
a full table with month columns; max content width 1120 centered. The settle
rule is the signature at every size; no desktop-only spectacle.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Inbox rows enter with 24ms stagger, opacity +
4px y-slide only — ledgers never bounce. Extraction-in-progress rows show a
1px `ink-3` underline shimmer (opacity 0.4→0.8 loop, 1.2s) — the only ambient
motion, removed the moment extraction lands. Chips crossfade 150ms. Sheet
opens 320ms `spring-gentle`. Targets ≥44px, ≥8px apart; destructive actions
(reject document, revoke share link) are hold-to-confirm (600ms fill).
Pull-to-refresh re-polls the extraction queue. Haptics native-only, never
load-bearing.

## Reduced motion & fallback
Settle rule → instant full-width rule + color swap, no draw. Counter tick →
direct number swap. Shimmer → static "Extracting…" text. Stagger → ≤100ms
opacity fade. Every animated state (confirmed, needs review, duplicate) is
also plain text in the row — nothing is motion-only.
