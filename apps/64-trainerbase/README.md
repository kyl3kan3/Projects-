# TrainerBase

**The coaching platform for independent personal trainers — the program delivered before the gym opens, the check-in answered before lunch.**

## The enemy

The Google Sheet with fourteen tabs named "Mike v3 FINAL". Independent
trainers coaching 5–50 clients run programming in spreadsheets, deliver
it over screenshots and texts, chase check-ins by DM, and bill through
three different apps. Every added client adds admin hours, which is
exactly why coaching businesses stall at 15 clients. TrainerBase kills
the spreadsheet-and-screenshot stack: build the program once, deliver
it to every client's phone, see who trained and who drifted, and get
paid — one system.

## Who pays

- Independent personal trainers and online coaches (5–50 clients).
- Small studio trainers running hybrid (in-person + app) coaching.
- The client uses a clean PWA — no app-store install friction.

## MVP feature list

1. **Exercise library** — the trainer's own movement list (seeded with
   a sensible base set): name, cues, demo video link (YouTube/Loom
   embed), equipment, muscle groups.
2. **Program builder** — blocks (weeks) → days → exercise rows with
   sets/reps/RPE/tempo/rest; supersets; progression notes; duplicate a
   week and edit forward.
3. **Assignments** — assign a program to a client with a start date;
   per-client substitutions (bad knee → swap the lunge) without
   forking the whole program.
4. **Client PWA** — today's workout on the phone: exercise rows,
   demo videos, set logging (weight × reps + RPE), rest timer, notes
   to coach; works offline mid-session, syncs after.
5. **Check-ins** — weekly configurable form (weight, photos, sleep,
   stress, wins/questions); trainer reviews with side-by-side photo
   history and replies in-line.
6. **Adherence dashboard** — the coach's morning screen: who trained
   yesterday, who's mid-week, who hasn't opened a workout in 5 days
   (the drift flag), check-ins waiting.
7. **Packages + billing** — Stripe subscriptions per client (the
   trainer's own Connect account): monthly coaching tiers, pause,
   cancellation; overdue clients flagged, never auto-cut.
8. **Messaging-lite** — per-client thread anchored to workouts and
   check-ins (not a chat app — context-attached comments).
9. **Templates** — save any program as a template; the 12-week
   hypertrophy base that onboards the next client in minutes.
10. **Exports** — client history and programs to CSV; anti-lock-in.

## Pricing

| Plan | Price | For |
|---|---|---|
| **Coach** | **$29/mo** | Up to 10 active clients. |
| **Studio** | **$49/mo** | Up to 25 active clients, templates, check-in forms. |
| **Roster** | **$79/mo** | Up to 50 clients, adherence dashboard, priority support. |

14-day free trial, no card. Client billing rides the trainer's own
Stripe — TrainerBase never touches client money.

## Competitive landscape

Trainerize and TrueCoach dominate (owned by ABC Fitness and Xplor —
platform companies whose roadmaps serve gym chains), with PT Distinction
as the power-user option; all price per-client in ways that punish
growth and ship decade-old client apps. TrainerBase's wedge: flat
plans a solo coach can predict, a client PWA that feels current
(offline logging, fast video), and the adherence dashboard as the
coach's daily surface — retention tooling, not just delivery.

## Landing page

- **Hero device:** "The program delivered before the gym opens." — a
  program week assembles row by row in the builder (sets/reps ticking
  in), flips to the phone frame as today's workout, three sets log
  with the rest timer running, and the adherence dashboard ticks the
  client green. Four beats, hold on the dashboard.
- **The enemy, named:** the spreadsheet named "Mike v3 FINAL".
- **Receipts:** a real drift flag ("No workout opened in 5 days") and
  a check-in reply thread (demo data, labeled).
- **One CTA phrase, verbatim everywhere:** **"Start free — 14 days"**.
