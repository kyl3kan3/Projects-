# TrainerBase Design — "The Coach's Clipboard"

Art direction anchored in the product's world: the clipboard under the
squat rack — chalk-white sheet, slate pencil, one whistle-orange
accent. Athletic without gym-bro clichés: no black-and-red aggression,
no flame gradients. Numbers do the talking — prescriptions and logged
sets in tabular mono, statuses as plain marks a coach reads mid-set.

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

## Palette

| Token | Hex | Use |
|---|---|---|
| `chalk` | `#F6F5F1` | App ground |
| `sheet` | `#FDFCF9` | Cards, panels |
| `line` | `#E1DFD6` | Hairlines only |
| `slate` | `#26282A` | Primary text; primary button fill |
| `dim` | `#6C6F70` | Secondary text |
| `faint` | `#A3A6A5` | Tertiary, disabled |
| `whistle` | `#D07A35` | THE accent: active set, rest timer, drift flags (≤10%) |
| `turf` | `#5B8A5E` | Semantic: completed / paid only |
| `rust` | `#AF4E3D` | Semantic: overdue / abandoned only |

Hard rules: `whistle` never fills a button or a surface — it marks the
active set row, the rest timer arc, and drift flags. `slate` is the
only high-emphasis fill (chalk text on it). Light-only in v1 — gym
floors are lit; a dark client theme is a v2 toggle, not a default.

## Type — exact specimen

Faces: **Barlow** (500/600/700 — athletic-department grotesk, honest
and compact) for display and UI · **JetBrains Mono** (500) for every
weight, rep, RPE, and timer. Both self-hosted woff2, preloaded.

| Role | Face/weight | Mobile size/lh | Notes |
|---|---|---|---|
| Display | Barlow 700 | 30/34 | -0.01em |
| H2 | Barlow 600 | 22/28 | |
| Title (row) | Barlow 600 | 16/22 | |
| Body | Barlow 500 | 16/24 | |
| Secondary | Barlow 500 | 13/18 | `dim` |
| Placard (status) | Barlow 600 | 11/14 | +0.08em, uppercase |
| Mono (weight/reps/timer) | JetBrains Mono 500 | 14–16 | tabular-nums |

## Space, radii, hairlines

4px scale. Radii: 10 (cards), 8 (inputs/chips), 999 (timer arc) —
three. 1px `line` hairlines; set rows separated by space + hairline.
Touch targets ≥ 48px; the set-logging steppers are 56px — gym thumbs,
mid-set.

## Signature detail — the set tick

Each prescribed set is a short slate dash in a row of dashes; logging
a set converts its dash to a filled `whistle` tick with a 120ms
settle, and the rest timer arc starts from the tick. A completed day
is a row of ticks — the exact mark a coach makes on paper. Dashboard,
client app, and landing device all draw this element.

## Motion

One signature: **the tick + arc** — set completion ticks (120ms
scale-settle) and the rest arc sweeps in real time (1s linear
segments). Week duplication in the builder slides the new week in
(180ms ease-out-quart). Everything else 120–160ms opacity/transform.
Reduced motion: ticks appear instantly; the arc becomes a numeric
countdown.

## Screens (MVP)

1. **Adherence dashboard (`/dashboard`)** — the coach's morning: rows
   per client — yesterday's tick row, current program position,
   drift flags in whistle ("No workout opened in 5 days"), check-ins
   waiting. Sorted: drifting first.
2. **Program builder (`/programs/[id]`)** — week tabs, day columns,
   exercise rows with sets/reps/RPE/tempo/rest inline-editable;
   superset brackets drawn as a thin left rule; duplicate-week
   button.
3. **Roster (`/clients`)** — client rows: status, package,
   billing_status chip, program, last activity.
4. **Client detail** — assignment timeline, substitution overlays,
   logged history (per-exercise progression table in mono), check-in
   history with photo pairs, anchored messages.
5. **Client PWA — today (`/t/[handle]`)** — the workout: exercise
   rows with demo links, set dashes → ticks, weight/rep steppers,
   the rest arc, note-to-coach; offline banner when queuing to the
   outbox ("3 sets will sync when you're back").
6. **Check-in (client)** — the form as sent (snapshot), photo
   capture, submit; trainer review split view with side-by-side
   photo history.
7. **Packages + billing (`/billing`)** — package editor, per-client
   subscription states, overdue flags.
8. **Landing** — chalk world, the builder-to-phone device (see
   README), the drift receipt, pricing, honest FAQ (per-client vs
   flat pricing math). CTA verbatim: "Start free — 14 days".

## Empty / loading / error

Empty states name the next action ("Build your first program — start
from the 12-week base template"). Loading = skeleton rows. Offline in
the client app is a first-class state, never an error: the outbox
count renders in whistle and drains visibly on reconnect.
