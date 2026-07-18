# SplitKit — Design Specification (redline level)

## Vision
The register of a beautifully kept legal ledger. The identity is **Ledger**: bone
paper grounds, graphite-black ink, and one oxblood mark — the color of a
registrar's stamp and a redline — used only for what has been *recorded*. Data,
timestamps, and hashes are set in tabular mono; headings speak in a sober serif
because this is the legal-document register, not a wellness app. It is
light-first by conviction — a ledger is a paper object — with a fully specified
charcoal reading-room dark mode for the 11 p.m. session at the kitchen table.
It reads as *steady*: the visual promise that chaos is being entered into order,
one line at a time, by an instrument that will not editorialize and will not
panic. Nothing cute, nothing soft-launch pastel, nothing that looks like a
divorce "journey."

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md fully: no purple (~250–310° banned), no emoji anywhere,
no gradients or glows on any element (the seal is a stroke animation, not a
glow), single SVG icon set, space-before-boxes, hairlines not borders, 4px
scale, ≤3 radii, real content everywhere, fonts must load. Native Expo app,
iOS-first, designed for a stressed reader over 48 — generous sizes, high
contrast, big targets, and forms that never lose input.

---

## Color — exact values and usage ratios

Light is the hero expression (paper is the ledger's native ground); dark is the
first-class evening companion. Both ship.

### Light (primary — the ledger page)
| Token | Hex | Use |
|---|---|---|
| `paper` | `#F4F1E8` | The ground. Bone — warm, unbleached, never sterile white. Every screen |
| `card` | `#FBF9F1` | Raised surfaces: cards, wells, sheets |
| `hairline` | `#DCD6C6` | 1px dividers, ledger rules, framed-object strokes |
| `ink` | `#201E19` | Primary text — graphite-black with a warm bias, never #000 |
| `ink-2` | `#5A564A` | Secondary text |
| `ink-3` | `#8F8A7A` | Faint: placeholders, disabled, axis labels |
| `oxblood` | `#6E2B33` | THE mark — deep desaturated carmine. Seals, hash lines, redline rules, active states, links, brand. ≤10% of any screen |
| `verdigris` | `#3E6B52` | Semantic "resolved / secured / done" only |

Primary button (light ground): `ink` fill, `paper` text.

### Dark (the charcoal reading-room)
| Token | Hex | Use |
|---|---|---|
| `paper` | `#171614` | Ground — warm charcoal, never black, never blue-black |
| `card` | `#211F1C` | Raised surfaces |
| `hairline` | `#37342D` | Dividers & rules |
| `ink` | `#EAE6D9` | Primary text — bone-white, faintly warm |
| `ink-2` | `#A39D8D` | Secondary |
| `ink-3` | `#6C675A` | Faint |
| `oxblood` | `#B45A60` | The same mark, lifted to read on charcoal — still desaturated, never coral, never bright red |
| `verdigris` | `#7CA98C` | Resolved / secured |

Primary button (dark ground): `ink` bone fill, `paper` charcoal text.

> **Color law (v5):** no purple, no lavender, no framework-default hexes. All
> values are custom-mixed and slightly desaturated. The oxblood is grounded in
> the product's real world — the registrar's stamp, the redline on a draft, the
> spine of a law report — not a Tailwind red. It is a *recorded* mark, not a
> danger color: destructive actions use plain `ink` text with a confirm step,
> never oxblood, so the accent's meaning stays singular.

Hard rules: `oxblood` never fills a large surface or a primary button; its home
is seals, hash lines, 1.5px rules, and small active indicators. `verdigris`
carries meaning only (task done, document secured, chain verified), never
decoration. The exported court-ready PDF renders as a **light paper document**
(bone `#F7F4EC`, ink `#1F1D18`, oxblood `#6E2B33` rules) regardless of app
theme, because it will be read printed, across a desk.

## Type — exact specimen

Faces: **Source Serif 4** (600/700, self-hosted variable) for the display
voice — a sober serif with slab-adjacent weight that reads as the register of
legal print, deliberately distinct from every sans-only sibling app; **Inter**
(400/500/600) for UI/body; **JetBrains Mono** (500/600) for figures,
timestamps, and hashes. All bundled via expo-font; a silent system-font
fallback is a failed build.

| Role | Face/weight | Size/lh | Tracking |
|---|---|---|---|
| Display (screen greetings, export title) | Source Serif 4 700 | 30 / 36 | −0.3 |
| H2 (section titles, sheet titles) | Source Serif 4 600 | 21 / 27 | −0.2 |
| Title (asset names, entry summaries) | Inter 500 | 17 / 22 | 0 |
| Body | Inter 400 | 16 / 24 | 0 |
| Secondary | Inter 400 | 14 / 20 | 0 |
| Label | Inter 600 | 11 / 13 | +0.9, uppercase |
| Data (values, dates, last-4s) | JBM 500 | 14 / 17 | 0, tabular |
| Hash line (timestamps + digests) | JBM 500 | 12 / 16 | +0.2, tabular |
| Big datum (totals, buyout figure) | JBM 600 | 34 / 34 | 0, tabular |
| Button | Inter 600 | 16 / 16 | 0 |

Minimum body size anywhere is 14 (the hash line at 12 is the sole sanctioned
exception — it is an artifact, not reading text). The serif carries brand at
the two largest roles only; everything operational is Inter; everything
numeric, dated, or hashed is mono.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`. Screen gutter **20**.
- Radii: **6** (controls) · **12** (cards) · **20** (sheets). Nothing else —
  tighter than sibling apps on purpose; a ledger is squared.
- Elevation: none in light (the ledger is flat; separation is hairline rules
  and space). In dark, depth is `card` lifted off `paper` plus hairline. The
  only shadow is the sheet scrim at 45%.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Glyphs: `checklist` (rows with check), `folder-vault` (folder with keyhole),
`camera`, `file-text`, `scale` (balance), `seal` (circled asterisk — the
record mark), `hash`, `house`, `bank` (columned facade), `pie` (pension
fraction), `calculator`, `lock`, `bell`, `check`, `x`, `plus`, `chevron-left`,
`chevron-right`, `chevron-down`, `settings`, `share`, `calendar`, `shield`,
`link`. Tab bar 22px, inline 18px. No emoji, ever.

## Component construction (exact)

- **Primary button:** `ink` fill, `paper` text, radius 6, height 52, Inter 600
  16. Press: scale 0.98 + fill dimmed 8% + selection haptic. Disabled:
  `hairline` fill, `ink-3` text.
- **Secondary:** transparent, 1px hairline, `ink` label. Press: border `ink-3`.
- **Quiet action:** text-only `oxblood`; press dims to 75%.
- **Checklist row (core control):** full-bleed, hairline rule between (the
  ledger line), min-height 56: 24px checkbox (radius 6, 1.5px `hairline`
  stroke; done = `verdigris` fill + `paper` check), task Title 17, state-note
  Secondary in `ink-2`, right chevron. Section headers are Label + progress
  `n/m` in JBM. Done rows: title in `ink-3`, no strikethrough (a ledger never
  crosses out).
- **Asset row:** full-bleed, hairline between, 64px: kind glyph in `ink-2`,
  name Title + institution/last-4 in JBM Data, right-aligned signed value JBM
  Data (debts prefixed `−`), titling Label chip (1px hairline, radius 6).
- **Totals strip:** `card`, radius 12, three columns (Joint / Hers / Unknown),
  Label over JBM Big datum; a 1.5px `oxblood` rule under the strip — the
  ledger's ruled total line.
- **Document card:** `card`, radius 12; thumbnail 64×64 (radius 6), title
  Title, kind + date Secondary, and the hash line: `seal` glyph 14px in
  `oxblood` + `SHA-256 a3f19c…` in JBM Hash style, `ink-3`.
- **Log entry card:** `card`, radius 12; occurred-at date Label, summary
  Title, channel + participants Secondary; footer is the seal line — a 1.5px
  `oxblood` rule, then `ENTERED 2026-07-17 21:44 · #48 · 9c41e2d07a1b` in JBM
  Hash with the `seal` glyph. Sealed entries show no edit affordance anywhere.
- **Seal button (entry form):** the one full-width primary button labeled
  **Seal into the record**; disabled until summary + occurred-at are set.
- **Scenario worksheet:** input rows (Label + JBM right-aligned field, hairline
  rules between — a ruled form); outputs in a `card` with JBM Big datum and a
  1.5px `oxblood` total rule; footer Secondary in `ink-2`: "Arithmetic on your
  numbers — not a valuation, not advice. Bring it to your attorney or a CDFA."
  The footer is part of the component, not optional.
- **Chain-verified badge (Settings/export):** `verdigris` `shield` glyph +
  "Chain verified · 48 entries" in Data; a break state swaps to `ink` text +
  plain-language explanation (never oxblood — see color law).
- **Paywall:** monthly card (`card`, 1.5px `oxblood` hairline, "7 days free"
  Label) above annual; single primary **Start free week**; restore as quiet
  action. No timers, no fake strikethroughs, no crossed-out prices.
- **Bottom tab bar:** height 56 + safe-area, `card` at 96%, hairline top.
  Checklist / Inventory / Log / Scenarios / Settings; active = `ink` icon +
  2px `oxblood` underline dash (not a dot — a ledger rule).

## The signature — the record seal
Tapping **Seal into the record** commits the entry (one transaction), then the
entry card performs the seal, top to bottom, ~700ms total: (1) a 1.5px
`oxblood` rule draws itself left→right under the entry body, 300ms ease-out —
the redline being ruled; (2) the JBM hash line types on beneath it — timestamp,
sequence number, then the 12-hex digest appearing character-by-character over
250ms; (3) the `seal` glyph + "RECORDED" Label stamp in at 1.06→1.0 scale with
a single rigid haptic. Nothing glows; it is ink arriving on paper. The same
seal (faster, 350ms) plays when a captured document's hash resolves. Reduced
motion: the completed seal line fades in at 200ms. This is the entire brand
animation, the 5-second hero of the landing page, and the moment the product
is named for: *the record they can't argue with.*

## Mobile layout (390×844 — primary spec)
- **Checklist (home):** Display greeting ("The record is current.") + state +
  stage Label; progress strip (sections × done counts in JBM); sectioned
  checklist rows; a quiet "What this list is — and isn't" education link
  (non-advice framing). Primary action zone: next undone task surfaced as a
  card above the fold.
- **Inventory:** totals strip first; asset rows grouped by kind; `plus` →
  asset form sheet (ruled form fields); asset detail sheet lists linked vault
  documents with hash lines + "Add document." Vault section below assets:
  document cards grid (2-col), capture button in the thumb zone.
- **Log:** reverse-chronological entry cards, each with its seal line;
  sticky **New entry** primary button bottom-third; header shows chain status
  (`shield` verified badge) and **Export** (paid) as quiet action → export
  sheet (date range chips, entry count, the method note in Secondary, then
  **Export court-ready PDF**).
- **Scenarios:** three worksheet cards (House / Pension / Cash flow) with
  one-line descriptions; tapping opens the ruled worksheet; outputs update
  live as figures are entered; attorney/CDFA footer always visible above the
  fold of the output card.
- **Settings:** state & stage, reminders, chain verification, encrypted backup
  export, delete-all-data (confirm phrase), restore purchases, the "not legal
  advice" disclosure, privacy explainer ("Try it: airplane mode. Everything
  works."), safety note with hotline resources, cited education library.
- **Modals/flows:** `lock` (bone screen, `lock` glyph, Face ID prompt —
  no data visible ever), `onboarding` (state → stage → children → lock setup →
  first checklist section), `entry` (the form + Seal), `capture` (camera/import
  → hash resolving → seal), `paywall`, `export`.

## Dark mode
Same structure, tokens swapped per the tables above. The oxblood lifts to
`#B45A60` for contrast on charcoal; rules and hash lines keep identical
geometry. The 11 p.m. use case belongs to dark: kitchen table, house asleep,
entering what was said at dinner — the charcoal reading-room keeps the screen
quiet while the seal's oxblood rule stays the only saturated thing in the room.

## Motion
- Standard: 200ms `ease-out` for state changes, 300ms `ease-in-out` for
  navigation and sheets.
- Checkbox and status taps: 120ms + selection haptic. No springs on data entry.
- The record seal is the only choreographed sequence. `prefers-reduced-motion`
  collapses everything to fades ≤200ms.

## Voice
The registrar's tone: plain, exact, unhurried. "Recorded", "Sealed",
"Entered", "Verified" — never "your journey", never exclamation marks, never
reassurance-fluff, and never anything that reads as legal or financial advice.
Empty states teach: "No entries yet. When something happens that you'd want
your attorney to know about, enter it here and seal it. Sealed entries can't
be edited — that's what makes the record worth keeping." Every scenario output
ends with the attorney/CDFA sentence, verbatim, every time.
