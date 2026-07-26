# KinDesk — Design Specification (redline level)

## Vision
**Evergreen desk**: the steadiness of a well-run household desk — warm linen paper, deep pine ink, one persimmon signal. Capable and calm, never clinical, never cute. The user is an exhausted, competent woman running two households; the interface should feel like the one organized surface in her week. Light-first (this is daytime logistics), with a fully specified deep-pine evening mode.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md fully: no purple (~250–310° banned), no emoji anywhere, no gradients/glows on controls, single SVG icon set, space-before-boxes, hairlines not borders, 4px scale, ≤3 radii, real content everywhere, fonts must load. Native Expo app, iOS-first, 390×844 primary spec; targets sized for hurried, interrupted use.

---

## Color — exact values and usage ratios

### Light (primary)
| Token | Hex | Use |
|---|---|---|
| `paper` | `#F2F3EC` | The ground — linen with a faint green cast (chosen, not default cream) |
| `card` | `#FBFCF6` | Raised surfaces: task rows, digest card, wells |
| `hairline` | `#DBE0CE` | 1px dividers & framed-object strokes |
| `ink` | `#1C291F` | Primary text — deep pine, never black |
| `ink-2` | `#54655A` | Secondary text |
| `ink-3` | `#8B9B8C` | Faint: placeholders, disabled, axis labels |
| `persimmon` | `#C2542F` | THE signal: needs-an-owner strip, active states, balances owed to you, brand. ≤10% of any screen |
| `moss` | `#3F7350` | Semantic "done / settled" only |
| `brick` | `#9E3B2B` | Semantic "overdue / owing" only |

Primary button: `ink` fill, `paper` text.

### Dark (evening)
| Token | Hex | Use |
|---|---|---|
| `paper` | `#131A14` | Deep pine ground |
| `card` | `#1C261E` | Raised surfaces |
| `hairline` | `#2E3C30` | Dividers |
| `ink` | `#EAF0E4` | Primary text |
| `ink-2` | `#9CAC98` | Secondary |
| `ink-3` | `#61715E` | Faint |
| `persimmon` | `#E57A50` | The signal, lifted for dark ground |
| `moss` | `#7FAD8B` | Done / settled |
| `brick` | `#D9705A` | Overdue / owing |

Primary button (dark): `ink` off-white fill, `paper` text.

> **Color law (v5):** no purple, no framework-default hexes; all values custom-mixed and desaturated. Persimmon is the warmth of the household — a fruit-bowl orange-red, not Tailwind orange; hues sit at ~105–140° (greens), ~14–18° (persimmon/brick). Distinct from MenoCompass (teal + amber), StimTrack (porcelain + marine), SplitKit (bone + oxblood).

Hard rules: `persimmon` never fills a large surface or a primary button; its main homes are the needs-an-owner strip, active tab dot, and the "owed to you" figure. `moss`/`brick` carry meaning only. The shared digest card renders on `card` in light-mode values regardless of app theme — it lands in other people's threads and must read like a clean printed note.

## Type — exact specimen

Faces: **Hanken Grotesk** (600/700, self-hosted variable) for the display voice — humanist, capable, warm; **Inter** (400/500/600) for UI/body; **JetBrains Mono** (500/600) for money and dates. All bundled via expo-font; a silent system-font fallback is a failed build.

| Role | Face/weight | Size/lh | Tracking |
|---|---|---|---|
| Display (greetings, digest title) | Hanken 700 | 29 / 34 | −0.3 |
| H2 (screen titles) | Hanken 600 | 21 / 26 | −0.2 |
| Title (task, doc, contact names) | Inter 500 | 17 / 22 | 0 |
| Body | Inter 400 | 16 / 24 | 0 |
| Secondary | Inter 400 | 14 / 20 | 0 |
| Label | Inter 600 | 11 / 13 | +0.9, uppercase |
| Money/date (amounts, balances, dues) | JBM 500 | 14 / 17 | 0, tabular |
| Big datum (net balance) | JBM 600 | 34 / 34 | 0, tabular |
| Button | Inter 600 | 16 / 16 | 0 |

Minimum body size 14. Every dollar figure is mono — money never proportional.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`. Screen gutter **20**.
- Radii: **12** (controls, rows) · **16** (cards, the digest) · **24** (sheets). Nothing else.
- Elevation: none in light beyond `card`-on-`paper` + hairline; the only shadow is the sheet scrim at 40% and a soft lift under the digest card when shared (it is a physical object).

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor. Glyphs: `check-circle` (tasks), `hand` (needs owner), `receipt`, `wallet`, `folder` (vault), `file-text`, `shield` (POA), `phone`, `user`, `users` (family), `calendar`, `bell`, `camera`, `plus`, `share`, `lock`, `settings`, chevrons, `x`, `pin` (decision log). Tab bar 22px, inline 18px. No emoji, ever.

## Component construction (exact)

- **Primary button:** `ink` fill, `paper` text, radius 12, height 52, Inter 600 16; press scale 0.98 + darker fill + selection haptic. Disabled: `hairline` fill, `ink-3` text.
- **Secondary:** transparent, 1px hairline, `ink` label. **Quiet:** text-only persimmon, press dims 75%.
- **Task row (core object):** full-bleed on `card`, 64px min: leading `check-circle` outline (tap = done, fills `moss` with a 200ms draw), Title 17, under it Secondary meta "Dana · due Thu"; unowned tasks show a persimmon `hand` glyph and sit in the **Needs an owner** strip pinned atop the board — the screen's only persimmon block.
- **Expense row:** receipt thumbnail 40×40 (radius 12) or category glyph; Title + Secondary payer/date; right-aligned JBM amount. Balances header: "You are owed" big datum in persimmon / "You owe" in `brick`.
- **Vault tile:** 2-col grid, radius 16, document glyph by tag (`shield` for POA), Title 15, Secondary tag + added-by; locked state shows `lock` in `ink-3`.
- **Contact row:** name + role, trailing `phone` glyph as a 44px tap target that dials immediately.
- **Digest card (the signature object):** radius 16 `card` with a 2px persimmon top rule; Hanken title "Mom, this week"; three typeset sections (Done & coming up / Money / Next appointments) with hairline separators, JBM figures; footer "Kept together with KinDesk" in Label. Always light-mode values.
- **Share-code sheet:** the code set in JBM 600 28, letter-spaced, on a hairline-framed well — designed to be read over the phone to a sibling.
- **Bottom tab bar:** height 56 + safe-area, `card` 96% + blur, hairline top. **Today / Tasks / Money / Vault / Settings**; active = `ink` icon + 2px persimmon dot.

## The signature — the digest assembling
Tapping **Share this week** (or the Sunday prompt): the digest card assembles top-to-bottom over 800ms — persimmon rule draws across, title settles, each section's rows slide up 8px at 60ms stagger, figures count to their values — then a beat, and the share button arms. It reads as: the week, put in order. Reduced motion: assembled card fades in at 250ms. This is the brand animation and the screenshot the product is marketed on.

## Mobile layout (390×844 — primary spec)
- **Today:** Hanken greeting ("Tuesday — Mom's week is in hand"); Needs-an-owner strip (if any); next 3 tasks; this week's spend line; next appointment; **Share this week** quiet action.
- **Tasks:** the board — Open (grouped by due), then Done this week collapsed; add-task sheet with owner picker (siblings as chips), due date, recur options.
- **Money:** balances header (big datum), expense list with receipt thumbnails, add-expense sheet (camera-first), settle-up flow with confirmation.
- **Vault:** search field, tag chips (POA / Insurance / Directives / Financial / Other), tile grid, add via camera or file; 10-doc free gate on the 11th.
- **Settings:** family members + share code, reminders, backup export, delete-all, privacy explainer ("The relay only ever sees ciphertext — here's what that means"), restore purchases.

## Motion
200ms ease-out state changes; 300ms sheets; the check-circle draw 200ms; the digest assembly is the only choreographed sequence. `prefers-reduced-motion` collapses everything to ≤250ms fades.

## Voice
Steady, warm, competent. "Needs an owner", "Dana is owed $214", "Kept together." Never guilt, never cheerleading, never medical instruction. Empty states teach: "No documents yet. The 2 a.m. rule: if you'd need it in an ER, it goes in the vault."
