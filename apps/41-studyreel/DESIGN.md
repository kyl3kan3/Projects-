# StudyReel — Design Specification (v3, redline level)

## Vision
Index cards on a library desk. StudyReel feels like the physical artifacts it
replaces — card stock, ink, a ruled margin — with one ink-blue accent that
means exactly one thing: *this is cited.* The wow is the flip to the source:
your professor's own slide answering the dispute. Everything else stays as
quiet as a reading room.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load. Native Expo app (Reanimated 3 + expo-haptics);
the companion web mirrors the same tokens.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `desk` | `#F5F3EC` | The ground. Every screen — a daylight, card-stock product |
| `card` | `#FEFDFA` | Review cards, source panels, sheets only — never list rows |
| `hairline` | `#E5E1D4` | 1px rules & card borders — never darker |
| `ink` | `#232620` | Primary text; **primary button fill** (desk text) |
| `text-2` | `#75786C` | Secondary text, meta |
| `text-3` | `#ABAD9F` | Faint (placeholders, future due dates) |
| `cite` | `#3A6BC4` | THE accent (ink blue). ≤10% of any screen: citation markers, source anchors, active states, links, focus rings, the flip edge |
| `amber` | `#C08F3C` | Thin-coverage / low-confidence states only |
| `green` | `#4C8A62` | Correct answers / mastered topics only |
| `red` | `#B14F42` | Wrong answers / failed ingests only |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: cite never fills a button or a surface; `ink` is the only
high-emphasis fill; semantic colors appear only in grading and coverage.
A citation marker is *always* cite blue — and cite blue means nothing else,
anywhere, ever. Single daylight world by choice; a "night reading" theme is
a Phase 3 decision, not an omission.

## Type — exact specimen

Faces: **Newsreader** (500/600, display optics) for headings and card fronts ·
**Figtree** (400/600) for UI · **IBM Plex Mono** (500) for data, timestamps,
and citation anchors. All bundled/self-hosted woff2, preloaded on web.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (card front) | Newsreader 500 | `clamp(22px, 6vw, 30px)` / 1.3 | 0 |
| H2 (screen title) | Newsreader 600 | 24 / 1.15 | −0.01em |
| Title (row) | Figtree 600 | 16 / 1.3 | 0 |
| Body (answers, notes) | Figtree 400 | 16 / 1.55 | 0 |
| Source passage | Newsreader 500 | 15 / 1.6 | 0 |
| Secondary | Figtree 400 | 13 / 1.45 | 0 |
| Label | Figtree 600 | 11 / 1.2 | +0.08em, uppercase |
| Data / anchors | IPM 500 | 13 / 1.2 | 0, tabular figures |
| Button | Figtree 600 | 15 / 1 | 0 |

Citation anchors are always mono: `LEC 7 · 34:12`, `SLIDES 3 · P.41`,
`DUE 18 OF 18`.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **10** (controls: buttons, inputs, chips) · **14** (cards, source
  panels) · **24** (sheets). Nothing else.
- Elevation: flat, with one exception — the active review card carries a
  single 1px hairline + 2px offset second hairline (a stacked-cards suggestion
  drawn with borders, not shadow). Sheets alone get a scrim.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `stack` (review), `book` (courses), `exam-sheet` (a ruled
page with a check), `chart` (readiness), `cite-mark` (a small superscript
asterisk-in-circle — the citation glyph), `mic` (lecture), `file` (pdf),
`slides`, `play`, `scrub-handle`, `check`, `x`, `flag` (report), `share`,
`plus`, `chevron-right`, `lock`. Tab bar at 22px, inline at 18px. **No emoji,
anywhere, ever** — mastery is a green figure, never a brain or a sparkle.

## Component construction (exact)

- **Primary button:** `ink` fill, `desk` text, radius 10, height 52,
  full-width in the thumb zone, Figtree 600 15. Press: scale 0.98 + fill
  `#343830` + `Haptics.selectionAsync`. Disabled: `#D9D5C6` fill, `text-3`.
- **Secondary:** transparent, 1px hairline, `ink`. Press: border `#D2CDBD`.
- **Quiet action:** text-only cite, no underline; press dims to 80%.
- **Input:** `card` fill, hairline border, radius 10, height 48, 16px text.
  Focus: border cite + 2px offset ring at 25% cite.
- **Chips (course/topic filters):** height 36, radius 10, hairline; active =
  cite 1px border + cite text. Never filled.
- **Review card:** `card`, radius 14, padding 24, the stacked-hairline edge;
  front in Display Newsreader centered on the upper half; the `cite-mark` +
  mono anchor bottom-right in cite. Grade bar beneath the card: four
  text buttons (Again / Hard / Good / Easy) in a hairline-divided row,
  height 52 — thumb zone, no colored fills; the pressed grade's label inks.
- **Source panel (the flip target):** `card`, radius 14: transcript span as
  Source-passage type with the cited sentence underlined 1.5px cite, mono
  anchor + audio scrub row (2px hairline track, 12px ink handle, play at
  44px); PDF sources show the page render with a cite-tinted highlight box
  (12% fill, 1.5px border).
- **Deck rows:** NO boxes. Full-bleed hairline rows ≥56px: Title, mono meta
  (`142 CARDS · 18 DUE`), coverage dot (green rich / amber thin), chevron.
- **Coverage map:** topic rows with a 4px hairline track + ink fill by
  mastery; thin topics carry an amber `THIN` Label chip — never hidden.
- **Exam item:** question in Body, options as hairline rows with 28px radio
  rings; after grading, correct row's ring fills green, chosen-wrong fills
  red, and the answer key line shows `cite-mark` + anchor.
- **Proposed-card queue:** cards arrive as rows with Approve (check) /
  Edit / Reject (x) inline at 44px each — approval is deliberate, per card.
- **Bottom tab bar:** height 56 + safe-area, `desk` 96% + blur, hairline top.
  Review / Courses / Exams / Readiness at 22px icons + 10px Figtree 600
  labels; active = `ink` + 2px cite dot; inactive = `text-3`.

## The signature — the flip to the source
Tapping the `cite-mark` on any card or answer flips it: the card rotates on
its vertical axis 180° in 320ms `ease-in-out-soft` (perspective 1200), and
mid-flip the edge catches a 1.5px cite line — as if the card's edge were
inked. The back is the source panel: the cited sentence already underlined,
audio scrubbed to the anchor. Flip back mirrors it. One flip at a time;
`Haptics.impactAsync(Light)` at the mid-point. This is the entire brand
animation — grading, navigation, and everything else is state feedback ≤240ms.

## Mobile layout (390×844 — primary spec)
- **Review (default tab, money screen):** gutter 20. Header: `DUE 18` in
  mono + streak day count as Label. The review card centered; grade bar in
  the thumb zone. Completed state: "18 of 18 — done for today" with
  tomorrow's count in Secondary; never a celebration scene.
- **Courses:** course rows (Title, mono `3 SOURCES · 142 CARDS`, coverage
  dot); course detail lists sources with status (`PROCESSING` shows a 2px
  hairline pulse), the coverage map, and the proposed-card queue. Primary
  button **Add material** in the thumb zone; upload sheet offers record /
  files / "from your laptop" (web-uploader link).
- **Exams:** past exams as hairline rows (`NCLEX MIX · 40 ITEMS · 78%`);
  config sheet (topics, length, format chips); the timed run is full-screen
  with a mono clock in the header. Excluded-thin-topics notice in amber
  before start.
- **Readiness:** per-topic mastery rows + the exam-date countdown in mono;
  the annual-plan upsell lives here, after value is visible.

## Responsive (and the companion web)
≥768px: review card caps at 560px centered; courses go two-column (sources |
coverage). The **web companion** mirrors tokens exactly: upload dropzone on
Courses, review with keyboard grading (1-4 keys shown as Label hints), exams
with side-by-side item + source panel — the flip becomes a slide-in panel on
wide screens (same 320ms, same cite edge). Max content 1120. No 3D anywhere.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Cards advance with a 12px x-slide +
`spring-gentle`; grade taps commit instantly (the next card doesn't wait for
choreography). Rows enter with 24ms stagger, opacity + 4px rise. Audio scrub
is direct-manipulation. Targets ≥44px, ≥8px apart; swipe up on the review
card = Good, down = Again (both always available as buttons); long-press a
card front to flag/report it. Haptics: selection on grade, light impact at
flip mid-point, success notification on daily completion — never on streaks
alone.

## Reduced motion & fallback
The flip → a 100ms crossfade between card and source panel (cite edge shown
statically). Card advance → instant swap. Stagger → ≤100ms opacity fade.
Hairline pulse → static `PROCESSING` label. Citations, grades, and coverage
are always present as text + the cite-mark glyph — nothing is motion-only.
Haptics retained.
