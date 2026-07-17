# TrainerBase Roadmap

## Phase 0 — Foundations

- Domain, Resend verification, Neon + Upstash + R2 projects.
- Stripe: SaaS products (three plans); Connect (Standard) application
  for trainer client-billing accounts.
- Seed exercise library content (150 movements with cue text).

## Milestone 1 — MVP (weeks 1–4): build → deliver → log

1. Trainer auth + settings; exercise library (+ seed set).
2. Program builder: blocks/days/rows, supersets, duplicate-week,
   templates.
3. Clients + invites (magic links); assignments with start dates;
   substitution overlays.
4. The client PWA: today's workout, set logging with idempotent
   outbox sync (offline-first), rest timer, completion.
5. Adherence dashboard with drift flags + the morning digest.
6. Billing: TrainerBase trial/plans; packages + client subscriptions
   on Connect; overdue flags.
7. Landing page per MARKETING_PLAYBOOK.md with the builder-to-phone
   device.

Exit criteria: a program built and assigned; a client (second
browser) logs a full day offline and syncs without duplicate sets;
the drift flag fires on a stale client; `typecheck`/`build`/`lint`
green.

## Milestone 2 — v1 (weeks 5–8)

- Check-in forms, submissions with photos (R2 signed flows), review
  queue, inline replies.
- Per-exercise progression views (e1RM table — arithmetic shown, no
  "AI insights").
- Anchored messaging; unread states.
- CSV exports (programs, history).

## Milestone 3 — polish (weeks 9–12)

- PWA install prompts + icon set; performance pass on gym networks.
- Template marketplace-lite (share a template by link,
  trainer-to-trainer).
- Client pause/resume flows; billing dunning views.

## Growth (quarter 2+)

- Wearable imports (Apple Health sessions as adherence signals).
- Video form-check attachments on logged sets (R2 + review queue).
- Team accounts (studios with multiple coaches).
