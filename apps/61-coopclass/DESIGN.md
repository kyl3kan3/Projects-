# CoopClass Design — "The Parish Hall Board"

Art direction anchored in the product's world: the cork board in a
parish-hall hallway — cream paper, navy ink from the good pen, neat
columns of index cards. Institutional warmth: serif headings that feel
like a school letterhead, grid-ruled schedules, stamped statuses.
Nothing playful-for-kids — the users are administrators; the tone is
"well-run little school."

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

## Palette

| Token | Hex | Use |
|---|---|---|
| `cream` | `#F7F4EC` | App ground (hall paper) |
| `card` | `#FDFBF5` | Cards, panels |
| `line` | `#E0DACB` | Hairlines, schedule rules |
| `ink` | `#26251F` | Primary text; primary button fill |
| `dim` | `#6F6C60` | Secondary text |
| `faint` | `#A5A08F` | Tertiary, disabled |
| `navy` | `#2F4A6E` | THE accent: active states, links, the registration clock (≤10%) |
| `brick` | `#A8503C` | Semantic: conflicts / lapsed checks only |
| `moss` | `#5B7F52` | Semantic: paid / valid / enrolled only |

Hard rules: `navy` never fills a button or a surface; `ink` is the only
high-emphasis fill (cream text on it). `brick` speaks only for
conflicts and lapsed checks — the two things a director must never
miss. Light-only: co-op mornings.

## Type — exact specimen

Faces: **Source Serif 4** (600 — letterhead authority without
stuffiness) for display and headings · **Inter** (400/500) for UI and
body · **IBM Plex Mono** (500) for times, capacities, and money. All
self-hosted woff2, preloaded.

| Role | Face/weight | Mobile size/lh | Notes |
|---|---|---|---|
| Display | Source Serif 4 600 | 30/36 | -0.005em |
| H2 | Source Serif 4 600 | 22/28 | |
| Title (card/class) | Inter 500 | 16/22 | |
| Body | Inter 400 | 16/24 | |
| Secondary | Inter 400 | 13/18 | `dim` |
| Placard (status) | Inter 500 | 11/14 | +0.08em, uppercase |
| Mono (times/caps/money) | Plex Mono 500 | 13–15 | tabular-nums |

## Space, radii, hairlines

4px scale. Radii: 8 (cards/inputs), 6 (chips), 2 (schedule cells) —
three. 1px `line` hairlines; the schedule grid is ruled like ledger
paper (hairlines both axes). Touch targets ≥ 44px.

## Signature detail — the capacity stamp

Every class card carries its capacity as a stamped fraction in Plex
Mono — "8/12" — that ticks as seats fill; at capacity it rotates 2° and
stamps "FULL — WAITLIST" in `brick`-outlined small caps, like a date
stamp hitting an index card. The registration-night device animates
this exact stamp; the admin grid shows a wall of them.

## Motion

One signature: **the stamp tick** — capacity changes tick with a 100ms
scale-settle; the FULL stamp lands with a 140ms rotate-settle
(2° → 0.5°). Waitlist promotions slide the card up one slot (160ms
ease-out-quart). Everything else 120–160ms opacity/transform. Reduced
motion: final states.

## Screens (MVP)

1. **Catalog admin (`/classes`)** — term switcher, class cards in
   period columns with capacity stamps, drag between periods (conflict
   check on drop; brick block names the collision).
2. **Schedule grid (`/grid`)** — periods × rooms matrix; each cell a
   class card; teacher/room conflicts render brick before they save.
3. **Registration portal (`/register`)** — family view: students as
   tabs, catalog filtered to each student's grade band, capacity
   stamps live, the running family total (with discount lines) pinned
   in the footer. The conflict block is inline and names the reason.
4. **Checkout summary** — the invoice built line by line (fees,
   materials, each discount named), payment-plan election, one Stripe
   Checkout button.
5. **Binder (`/binder`)** — volunteer rows: name, role, check kind,
   expiry with status chip (valid/expiring/lapsed); the "lapses before
   term end" filter is the audit answer.
6. **Digest preview (`/digest`)** — this week's compiled digest per
   family, sendable manually before Sunday automation.
7. **Rosters (`/rosters`)** — per-class lists with allergy/emergency
   flags; per-period "who's where" grid; print stylesheets that
   actually work (teachers print these).
8. **Landing** — cream world, the registration-night device (see
   README), the discount math receipt, binder close-up, pricing,
   honest FAQ. CTA verbatim: "Start free — 14 days".

## Empty / loading / error

Empty states name the next action ("Create Fall 2026 and add your
first class"). Loading = skeleton cards. Conflict errors always name
the student, period, and colliding class — the sentence a volunteer
can read aloud at the folding table.
