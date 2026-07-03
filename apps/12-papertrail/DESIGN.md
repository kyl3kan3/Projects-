# PaperTrail — Design Specification (v3, redline level)

## Vision
PaperTrail makes a solo freelancer look like an established firm. It sends the
documents that ask strangers for thousands of dollars — proposal, contract,
invoice — as one linked chain where nothing is retyped. Fine-stationery calm:
ivory paper, ink-navy type, one fountain-blue thread of accent.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `ivory` | `#F8F5EF` | The ground. Every app screen. |
| `sheet` | `#FFFFFF` | Document cards and client-facing pages only — they are literal paper objects |
| `hairline` | `#E5DFD2` | 1px dividers & document borders — never darker |
| `ink` | `#14213D` | Primary text; **primary button fill**; the completed thread |
| `text-2` | `#6E6B60` | Secondary text, meta |
| `text-3` | `#A6A192` | Faint (dotted future thread, placeholders) |
| `fountain` | `#2D5BFF` | THE accent. ≤10% of any screen: links, active states, focus rings, the live-signing pulse |
| `wax` | `#2E7D5B` | Semantic: signed / paid only — the seal and PAID stamp |
| `vermilion` | `#C6432F` | Semantic: overdue only — marginalia, never body text |

Hard rules: fountain never fills a button or a surface; ink is the only
high-emphasis fill on ivory (paper-on-dark never occurs — there is no dark
ground). Wax and vermilion appear only where they mean signed/paid/overdue.

## Type — exact specimen

Faces: **Source Serif 4** (400/600) — contract-grade serif for documents and
display · **Inter** (400/500/600) for UI · **JetBrains Mono** (500) for
dashboard money. All self-hosted/embedded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (doc titles, H1) | SS4 600 | `clamp(26px, 7vw, 40px)` / 1.15 | −0.01em |
| H2 (screen title) | SS4 600 | 22 / 1.2 | −0.01em |
| Title (row/card) | Inter 600 | 16 / 1.3 | 0 |
| Body | Inter 400 | 16 / 1.55 | 0 |
| Document body | SS4 400 | 16 / 1.6 | 0 |
| Secondary | Inter 400 | 13 / 1.45 | 0 |
| Label | Inter 600 | 11 / 1.2 | +0.08em, uppercase |
| Money (dashboard) | JBM 500 | 15 / 1.2 | 0, tabular figures |
| Money (in documents) | SS4 600 | 18 / 1.2 | 0, `oldstyle-nums` |
| Button | Inter 600 | 15 / 1 | 0 |

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **8** (controls: buttons, inputs, chips) · **2** (document cards —
  paper is nearly sharp) · **16** (sheets). Nothing else.
- Elevation: document cards carry one soft deckle shadow
  (`0 1px 3px rgba(20,33,61,0.10)`) — they are the app's only framed objects.
  Everything else is flat hairlines.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `file-text`, `pen-nib` (sign), `seal` (circle + ribbon),
`send`, `bell` (remind), `banknote`, `link` (thread), `copy`, `download`,
`chevron-left`, `chevron-right`, `plus`, `check`, `clock`, `chart` (income),
`building` (client), `pencil`, `trash`. Tab bar renders at 22px, inline 18px.
**No emoji, anywhere, ever** — status is the seal chip, not a colored circle
emoji; the manicule (☞) of v2 is cut.

## Component construction (exact)

- **Primary button:** ink fill, ivory text, radius 8, height 48, full-width in
  the thumb zone, Inter 600 15. Press: scale 0.98 + fill `#0E1830`. Disabled:
  `#D8D2C4` fill, `text-3` text.
- **Secondary:** transparent, 1px hairline border, ink text. Press: border
  `#CFC7B6`.
- **Quiet action:** text-only fountain, no underline; press dims to 80%.
- **Input:** sheet fill, hairline border, radius 8, height 48, 16px text.
  Focus: border fountain + 2px offset ring at 25% fountain.
- **Seal chip (status):** height 24, radius 8, Label(11) text + 6px dot.
  Draft = hairline/`text-2`; Sent = ink outline; Signed = wax dot + wax text;
  Paid = wax fill at 12% + wax text; Overdue = vermilion dot + vermilion text.
- **Document card:** `sheet` fill, hairline border, radius 2, deckle shadow,
  padding 16: SS4 title ("Brand refresh — Meridian Coffee"), money in
  oldstyle figures ("$4,800"), seal chip top-right. Cards only for documents.
- **List rows (Documents, clients):** NO boxes. Full-bleed rows, ≥56px,
  hairline between: Title 16, JBM meta (`INV-023 · due Jul 18`), seal chip
  right.
- **The chain thread:** a 1.5px SVG line stitching document cards vertically,
  16px from the left gutter. Completed span solid ink; future span dashed
  `4 4` in `text-3`; node dots 8px.
- **Bottom tab bar:** height 56 + safe-area, ivory 96% + blur, hairline top.
  Chain / Documents / Income / Settings at 22px icons + 10px Inter 600
  labels. Active = ink + 2px fountain dot; inactive = `text-3`.

## The signature — the thread completing
When a client signs (live, via socket, or replayed on next open), exactly:
the contract card's thread segment draws taut — `stroke-dashoffset` animates
over 200ms `ease-out-quart`, dashed → solid ink; the wax seal chip presses in
(scale 1.15 → 1, `spring-snappy`) gaining an inner deboss
(`inset 0 1px 2px rgba(0,0,0,0.25)`) in `wax`; then the next node — the
deposit invoice — stitches into existence beneath it: node dot scales 0 → 1
(120ms), its card fades up 12px over 240ms. Total sequence ≤600ms, plain SVG
stroke + transform, 60fps on any phone. That's the thesis — "one thread from
maybe to paid" — rendered small.

## Mobile layout (390×844 — primary spec)
Phone owns review-and-act; desktop owns authoring.
- **Chain (money screen):** gutter 20. Client header ("Meridian Coffee ·
  $4,800 engagement"). The vertical thread: Proposal (Signed) → Contract
  (Signed) → Deposit $1,440 (Paid) → Final $3,360 (Sent, due Jul 18) as
  document cards on the thread. Primary button pinned in the thumb zone,
  contextual: "Remind — final invoice".
- **Document view:** the client-facing sheet rendered true-aspect (scrolls),
  seal chip in a sticky header, "Send / Copy link / Void" in a bottom sheet
  (radius 16, grab handle 40×4 `hairline`).
- **Income:** three stat blocks divided by hairlines (not boxes): PAID
  `$18,250`, OUTSTANDING `$6,400`, OVERDUE `$1,200` — Label caption + JBM
  figure; overdue figure gets a vermilion underline (2px) only when > 0.
  Below: a year strip of 12 month spines (24px wide bars, ink at 15–85%
  by revenue) scrolling horizontally in its own container.
- **Templates:** document cards in a single column — "Web design proposal",
  "Consulting agreement", "Retainer invoice" — each one tap from use; shared
  art direction with the SEO template pages.

## Responsive
≥768px: the chain turns horizontal (cards in a row, thread running through);
the editor opens as a true-aspect WYSIWYG page with chain settings (deposit
%, reminder cadence) as right-rail marginalia in Label type. ≥1024px: Income
gains a two-column layout (stats + aging table); max content width 1080
centered. Marketing page may use a scroll-driven 2D corner-fold
(proposal → contract) — CSS only, desktop only, static stacked sheets
otherwise. No 3D anywhere.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Signature capture: the client's drawn stroke
replays once as ink (600ms, stroke-dashoffset), audit-trail lines print
beneath one-by-one (60ms stagger — "Signed by R. Álvarez · 14:32 · IP
189.14.2.20"). PAID stamp: scale 1.2 → 1 `spring-snappy` with deboss; invoice
total settles fountain → ink in 200ms. Dashboard totals roll (odometer,
`dur-standard`). Targets ≥44px; swipe a document card left for Send /
Duplicate / Void (all present as buttons in detail); pull-to-refresh on Chain
and Income.

## Reduced motion & fallback
Thread draw, seal press, and stitch → final states appear instantly with a
100ms fade; signature replay → static signature above the full audit list;
stamps appear without motion; odometers → value swaps. Status is always
carried by the seal chip's text, so nothing depends on animation.
