# SessionScribe — Design Specification (v5, redline level)

## Vision
The consulting room at 3:05pm: warm paper, soft light, nothing raising its
voice. SessionScribe reads like well-kept clinical stationery — serif headers
with the calm of a bound casebook, sage used the way a fountain pen signs, mono
timestamps keeping honest time. The satisfying moment is the sign: a line
drawing itself, a hash stamping, a record locking — quiet, final, yours.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `paper` | `#F7F5F0` | The ground. Every screen — warm consulting-room paper |
| `card` | `#FDFCF8` | The note sheet, transcript panel, sheets only |
| `hairline` | `#E6E2D8` | 1px dividers & panel borders — never darker |
| `ink` | `#262B26` | Primary text AND primary button fill (warm-green black) |
| `ink-2` | `#6B7168` | Secondary text |
| `ink-3` | `#9CA197` | Faint (timestamps, placeholders, purged-media notes) |
| `sage` | `#6C8F6E` | THE accent. <=10% of any screen: the signature line, links, active states, focus rings, source-span highlights, the READY dot |
| `amber` | `#B08A3E` | Drafting / awaiting review / unsigned aging only |
| `red` | `#AE4A3C` | Failed pipeline / consent missing only |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: `sage` never fills a button or a surface; `ink` is the only
high-emphasis fill (paper text on it). There is no separate success green —
signed *is* the success state and it belongs to `sage`, the app's one accent.
Committed to the single warm-light world: this is stationery for a room with
a lamp, no dark theme in v1, by choice.

## Type — exact specimen

Faces: **Source Serif 4** (500/600 — the casebook voice) for display and
screen titles · **Public Sans** (400/500/600 — plainspoken US-civic sans) for
UI and body · **Spline Sans Mono** (500) for every timestamp, duration, hash,
and the between-sessions clock. All self-hosted woff2, preloaded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (marketing hero) | SS4 600 | `clamp(32px, 8.5vw, 54px)` / 1.08 | −0.015em |
| The clock (hero stat) | SSM 500 | `clamp(34px, 9.5vw, 52px)` / 1.05 | −0.01em, tabular |
| H2 (screen title) | SS4 600 | 22 / 1.25 | −0.01em |
| Title (session/client row) | PS 600 | 16 / 1.3 | 0 |
| Body (note text) | PS 400 | 16 / 1.6 | 0 |
| Transcript excerpt | PS 400 | 14 / 1.55 | 0 |
| Secondary | PS 400 | 13 / 1.45 | 0 |
| Label | PS 600 | 11 / 1.2 | +0.08em, uppercase |
| Data / time / hash | SSM 500 | 13 / 1.2 | 0, tabular figures |
| Button | PS 600 | 15 / 1 | 0 |

Note body text is the most-read surface in the product — 16/1.6 is a floor,
not a suggestion. Content hashes render mono `ink-3`, truncated middle
(`a41f…9c2e`), full on tap.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **8** (controls: buttons, inputs, chips) · **12** (note sheet,
  transcript panel) · **20** (sheets, the sign modal). Nothing else.
- Elevation: none. Depth is `card` on `paper` plus hairlines; only the sign
  sheet's scrim shadows.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `mic-quiet` (record), `arrow-up-tray` (upload), `pencil-line`
(shorthand), `waveform-min` (transcribing), `file-text` (note), `pen-nib`
(sign), `lock-small` (signed), `link-span` (source trace), `clock-round`
(the between-sessions clock), `shield-line` (trust/audit), `eye-log` (audit
event), `flame-out` (purge), `download`, `chevron-right`, `plus`. Nav renders
at 22px, inline at 18px. **No emoji, anywhere, ever** — a signed note gets
`lock-small`, not a checkmark emoji.

## Component construction (exact)

- **Primary button:** `ink` fill, `paper` text, radius 8, height 48 mobile
  (full-width in thumb zone), PS 600 15. Press: scale 0.98 + fill `#31372F`.
  Disabled: `#DAD6CB` fill, `ink-3` text.
- **Secondary:** transparent, 1px hairline, `ink`. Press: border `#CFCABD`.
- **Quiet action:** text-only, `sage`, no underline; press dims to 80%.
- **Input:** `card` fill, hairline border, radius 8, height 48, 16px text.
  Focus: border `sage` + 2px offset ring at 25% sage.
- **Session rows (Today view):** NO boxes. Full-bleed rows >=56px, hairline
  between: Title(16) client label + format ("J.R. — EMDR / DAP"), mono time
  right, Secondary status line below; status dot left (`sage` READY,
  `amber` DRAFTING / UNSIGNED, `red` FAILED). A signed row swaps the dot for
  `lock-small` in `ink-3` — signed is calm, not celebrated twice.
- **The note sheet (review room):** `card`, radius 12, padding 16: section
  Label ("SUBJECTIVE"), Body text, per-section quiet actions (Regenerate ·
  Trace) in the section footer. Sections divided by hairlines, never nested
  cards.
- **Source-span highlight:** tapping a drafted sentence underlines it 1.5px
  `sage` and washes its transcript segments in 12% sage; tapping a transcript
  segment does the reverse. One pair active at a time.
- **The sign gate (sheet):** radius 20, from the bottom: credentials line
  (PS 600), the content preview rule, mono hash line, then the primary
  **Sign note** button. Below it, Label "SIGNED NOTES ARE LOCKED. AMENDMENTS
  CREATE A NEW SIGNED VERSION." — the promise, typeset, every time.
- **Signature block (rendered on signed notes/PDF):** hairline top rule, the
  clinician's signature line in `sage` (SVG stroke), name + credentials
  (PS 600 13), mono `signed 2026-07-17 15:07 · a41f…9c2e`.
- **Status pill:** height 28, 6px dot + Label(11): `sage` "READY",
  `amber` "DRAFTING" / "AWAITING COSIGN", `red` "FAILED" / "NO CONSENT".
- **Audit rows (trust screen):** mono timestamp + actor + action, hairline
  rows, filter chips (Views / Edits / Signs / Exports / Purges). Purge rows
  get `flame-out` in `ink-3` — deletion is shown proudly.
- **Bottom tab bar:** height 56 + safe-area, `card` at 96% + blur, hairline
  top: `clock-round` (Today) / `plus`-circle (Capture) / `file-text` (Notes) /
  `shield-line` (Trust) at 22px + 10px labels; active = `ink` + 2px `sage`
  dot; inactive = `ink-3`.

## The signature — sign & lock (four beats)
The one signature detail, on the sign action, <=900ms total, mobile-first:

1. **The line draws** — the clinician's signature stroke draws left-to-right
   in `sage` (240ms, `ease-out-quart`).
2. **The hash stamps** — the mono content hash fades up beneath it (120ms),
   tabular digits settling like a postmark.
3. **The lock** — the note sheet's hairline border deepens to `ink` and the
   section action footers slide away (200ms, `ease-in-out-soft`): the sheet
   visibly becomes a record.
4. **The clock stamps** — the between-sessions clock chip flips to
   `signed 3:07` with `spring-snappy`, and the Today row swaps its dot for
   `lock-small`.

No confetti, no green flash, no sound. Everything else in the product is
state feedback <=240ms.

## Mobile layout (390×844 — primary spec)
- **Today (home):** gutter 20. Label "THURSDAY JUL 17" + the clock hero —
  mono `3:02` beside Secondary "draft ready · next client 3:10" when a
  pipeline is live; otherwise the day's tally ("5 sessions · 4 signed ·
  1 ready"). Then session rows. Thumb-zone primary: **Capture session**.
- **Capture:** three full-width rows (Record · Upload · Shorthand), client
  picker (recent first), consent state shown inline (`red` "NO CONSENT ON
  FILE" blocks Record, never Shorthand). Recording screen: mono elapsed
  timer, a quiet 3px level bar in `sage`, **End session** in the thumb zone.
- **Review room:** the note sheet full-width; transcript behind a top tab
  ("Note / Transcript") at phone width with span-tracing preserved across
  the flip. Sticky bottom bar: **Sign note** primary + word count. Editing
  is inline; regenerate is per-section.
- **Client:** display label, modality, default template, consent state,
  session history rows (mono dates, status), retention note ("audio purges
  after 30 days") in `ink-3`.
- **Trust:** BAA state, retention window control, the audit log, export.
  This screen is designed with the same care as Today — it closes sales.
- **First run:** three cards — set your format (SOAP/DAP preview), add a
  client label, capture a 60-second test session (mic check ends with a
  real tiny draft). Real data replaces each card as it completes.

## Responsive
>=768px: the review room becomes the two-pane it wants to be — transcript
left, note sheet right, spans tracing across the gutter; Today gains a week
strip. >=1024px: left rail replaces the tab bar; max content width 1120
centered; the sign gate becomes a centered modal (radius 20). The sign & lock
beats remain the signature at every size; no desktop spectacle.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Rows enter with 24ms stagger, opacity + 4px
y-slide only — clinical records never bounce. Section regeneration shows a
1.5px `amber` progress hairline atop the section, then crossfades old->new
text (200ms) — text is never typed out character-by-character. Tab flips
150ms crossfade; sheets 320ms `spring-gentle`. Targets >=44px, >=8px apart.
Destructive or record-heavy actions (purge now, revoke access, amend) are
hold-to-confirm (600ms fill) and always audit-logged. Haptic on sign, native
only, never load-bearing.

## Reduced motion & fallback
Sign & lock -> the signature block appears complete with a <=100ms fade; the
clock chip swaps directly; border-lock is instant. Span tracing -> static
highlight, no wash animation. Stagger -> <=100ms opacity fade. Signed /
drafting / failed states are always plain text + pill in the row — nothing
is motion-only.
