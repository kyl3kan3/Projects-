# RosterRally Roadmap

## Phase 0 — Setup (Week 0, ~3–5 days)

- Next.js 15 + TypeScript + Tailwind v4 scaffolded; CI runs lint + typecheck
- Neon Postgres + Drizzle migrations; Upstash Redis + BullMQ round-trip; worker deploys as its own service
- Stripe Connect (Standard) configured in test mode; application-fee flow verified against a test connected account
- Resend domain verified; Twilio test number acquired; 10DLC registration started (weeks of lead time — begin now)
- `.env.example` complete; Sentry wired into app and worker

**Acceptance criteria:**
- [ ] A test checkout on a connected account lands the payment there with our application fee split off
- [ ] A delayed BullMQ job enqueued from the app executes in the worker

## Phase 1 — MVP (Weeks 1–8)

- **Weeks 1–2: Registration spine.** Club/season/division model; public registration page (household + players + waiver ack + SMS consent); Stripe checkout with sibling discounts and scholarship codes; live registrar dashboard; waitlists.
- **Week 3: Money edges.** Installment plans (deposit + schedule), refunds/credits, CSV export, unpaid-installment chasing job.
- **Week 4: Rosters.** Drag-and-drop builder from the paid pool, guardrails, coach assignment, jersey numbers, roster locks, coach-scoped views.
- **Week 5: Schedule + conflicts.** Venues/fields, game/practice builder, CSV import, the conflict checker (hard blocks, soft flags), publish gate, iCal feeds.
- **Weeks 6–7: Comms + volunteers.** Announcement composer with audience targeting, email/SMS fan-out, delivery/read receipts, re-send-to-unreached; game-day reminders; volunteer slots with no-login claim links and reminders.
- **Week 8: Our billing + hardening.** Flat plan billing, plan switching, audit log, webhook replay tolerance, fan-out load test (500-household club).

**Acceptance criteria:**
- [ ] A parent registers two children with a sibling discount on a phone in under 5 minutes (timed test), money lands in the club's Stripe account, our fee splits correctly, scholarship codes skip our fee
- [ ] Waitlist: a full division waitlists the next registration and promotes it (with payment) when a spot opens
- [ ] Roster guardrails proven: a player cannot be on two teams in one division; locked rosters reject edits
- [ ] Conflict gate proven by fixture: same-field/time overlap and team double-booking BLOCK publish; coach and sibling overlaps flag but allow explicit override; resolving the conflict clears the pennant
- [ ] Publishing a schedule updates iCal feeds and queues T-24h/T-3h reminders; editing a published game re-fans-out only to affected teams
- [ ] Announcement to a 200-household fixture club delivers with per-household receipt states; SMS goes only to consented households; "re-send to unreached" targets exactly the unreached
- [ ] Volunteer slot: claim from a link without login, capacity enforced, reminder sent, claim visible in the console
- [ ] Coach role sees only their teams' rosters and medical fields are hidden from coach exports
- [ ] 3–5 design-partner clubs run a real registration window with zero mis-sent announcements and zero payment reconciliation errors

## Phase 2 — Launch (Weeks 9–14)

- Marketing site to MARKETING_PLAYBOOK.md (device: 10 hrs/week → 20 minutes; 5-second demo: a schedule publishing through the conflict gate)
- Free schedule conflict-checker (CSV upload → highlighted conflicts) as the lead magnet
- Migration guides + comparison pages (vs SportsEngine, vs TeamSnap, vs Jersey Watch); "switching kit" imports (players/teams CSV)
- Onboarding polish: season templates per sport, demo club, handoff-friendly multi-admin
- Launch timed to a registration window: registrar Facebook groups/subreddits, founder-led, club-to-club referral offer live

**Acceptance criteria:**
- [ ] Self-serve funnel proven: 15 clubs open a real registration season with zero human help
- [ ] 40 clubs live; ≥ 5,000 registrations processed cumulatively; support < 5 tickets/week per 40 clubs
- [ ] Conflict-checker lead magnet converting uploads to club signups at a measured rate (target ≥ 10%)
- [ ] SMS: delivery > 95%, zero TCPA complaints, per-club budgets enforced
- [ ] At least 3 clubs arrived via referral from an existing club (the league-spread motion works)

## Phase 3 — Growth (Months 4–12)

- Multi-season/multi-program clubs; cross-season player history
- Volunteer fairness rotation + hour tracking; background-check status field (integration deferred until partner secured)
- League mode v1: shared venues + cross-club scheduling within one league
- Financial reporting for treasurers (season P&L, fee reconciliation export)
- Annual flat plans; referral program formalized; sport-specific templates (swim meets, hockey ice slots)

**Acceptance criteria:**
- [ ] 150+ active clubs; a full year retention cohort shows > 75% of clubs returning for their next season
- [ ] League mode piloted with ≥ 2 real leagues sharing venues without double-booking incidents
- [ ] Treasurer report adopted by ≥ 40% of clubs at season close
- [ ] Off-season engagement measured honestly: ≥ 30% of clubs active (comms or volunteers) between registration windows
- [ ] Blended margin ≥ 75% in peak SMS months (budget knobs working)
