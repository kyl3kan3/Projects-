# RosterRally

**Operations for youth sports clubs: season registration with payments, rosters, conflict-checked schedules, parent comms with read receipts, and volunteer signups — so the registrar gets their 10 hours a week back.**

---

## The Problem

Every youth sports club runs on one exhausted volunteer. The registrar/treasurer collects registration through a Google Form, chases payments over Venmo screenshots, builds rosters in a spreadsheet, discovers the U10 and U12 teams are booked on the same field at the same hour after the schedule email went out, and answers "what time is the game?" forty times a week in three different group chats. Ten-plus hours a week, every season, unpaid.

The market underneath that volunteer is enormous and still badly served:

- US youth sports is a **$40B+ market**, the largest share of a global category measured at ~$62B in 2026 ([Statista](https://www.statista.com/statistics/1105424/youth-sports-market-size/), [Youth Sports Business Report](https://youthsportsbusinessreport.com/youth-sports-hits-record-participation-but-46-cost-surge-and-widening-income-gap-threaten-growth/)).
- **55.4% of US children aged 6–17 played organized sports in 2023** — participation is at record levels and rising ([Aspen Institute Project Play](https://projectplay.org/youth-sports/facts/participation-rates)).
- Families spend an average of **~$1,016 per child per year** on youth sports, up 46% since 2019 — money that flows through exactly the registration-and-dues rails a club runs on ([Youth Sports Business Report](https://youthsportsbusinessreport.com/youth-sports-hits-record-participation-but-46-cost-surge-and-widening-income-gap-threaten-growth/)).
- The incumbent club platform, SportsEngine (NBC Sports), starts around **$799/year plus per-transaction fees** and is routinely criticized for support and complexity ([TeamLinkt's SportsEngine alternatives roundup](https://teamlinkt.com/blog/best-sportsengine-alternatives-in-2026)); TeamSnap's club product is custom-priced and its team app pushes costs onto every team ([TeamSnap](https://www.teamsnap.com/teams)).

Clubs of 50–500 players are stuck between "free chaos" (Forms + Venmo + group texts) and "enterprise platform priced like a school district." Nobody owns the volunteer-registrar-first middle.

## Target User

- **Primary:** the volunteer registrar, treasurer, or club admin of a community youth sports club — soccer, baseball/softball, basketball, hockey, lacrosse, swim — with 50–500 players, 4–40 teams, and 1–3 seasons a year.
- **Secondary:** small leagues coordinating a few clubs; all-volunteer town rec programs; coaches and team managers as invited users; parents as the audience (they never pay us and never download anything).
- **Buyer moment:** four weeks before registration opens, or the week after a schedule disaster.
- **Not a target:** national governing bodies, tournament-series operators, school athletics, or clubs that need website CMS + fundraising suites on day one.

## Market & Profitability

- Registration is the wedge and the revenue: clubs happily pass a small per-registration fee through to parents (the category norm), so the product monetizes the moment it's adopted — no procurement, no invoice to a volunteer board.
- Realistic outcome: **$15k–$90k MRR equivalent** in 2–4 years. 300 clubs × ~150 registrations/year × $1.50 ≈ $67.5k/year from fees alone, plus flat-plan clubs; blended, a few hundred active clubs is a real business.
- Seasonality is structural (registration spikes fall/spring); the comms + schedule + volunteer surface keeps clubs logged in between seasons.
- Costs are ordinary web infra + SMS; margins 80–85% (SMS is the only meaningful variable cost).

## Monetization & Pricing

| Plan | Price | Notes |
|---|---|---|
| **Per-registration** | $1.50 per paid registration | Default. Passed through to parents at checkout (club chooses to absorb or pass). Free for the club; unlimited teams, comms, volunteers |
| **Club flat** | $49/mo per club | For clubs that hate per-fees or run many free/scholarship registrations. Everything unlimited |

Stripe processing fees are separate and stated plainly (parents see one honest total). Scholarship/discount codes never incur our fee. Annual flat billing at 2 months free. No charge to parents beyond the pass-through; no per-team or per-seat pricing ever — that's the incumbent resentment we exploit.

## MVP Feature List

- [ ] Club + season setup: divisions (U8–U19), programs, capacity, early-bird windows, sibling discounts, scholarship codes
- [ ] Registration flow: parent registers child(ren) on a phone in under 5 minutes — form builder with standard fields (medical, emergency contacts, waivers with e-acknowledgment), Stripe payment (card/ACH), plans (deposit + installments)
- [ ] Registrar console: live registration dashboard, payment status, refunds/credits, waitlists per division, CSV export
- [ ] Roster builder: drag players from the registration pool onto teams; coach/manager assignment; jersey numbers; roster locks
- [ ] Schedule builder with **conflict detection**: fields/venues + time slots; hard conflicts (same field/time, same team twice) blocked, soft conflicts (coach on two teams, sibling overlap) flagged before publish
- [ ] Parent comms: email + SMS announcements per club/division/team with **read receipts**; automated game-day reminders; every message archived and visible (no more "I never got it")
- [ ] Volunteer slots: per-game/per-event signup sheets (snack bar, field lines, scorekeeper) with capacity, reminders, and a no-login claim link
- [ ] Calendar out: per-team iCal feed + printable schedule
- [ ] Billing for RosterRally itself (Stripe: per-registration application fees via Connect, or the flat plan)

Post-MVP (explicitly cut from v1): league-to-league scheduling, referee assignment, background-check integrations, websites/CMS, fundraising, tournament brackets, stats/scores.

## Differentiation

1. **Built for the registrar, not the league office.** Every incumbent demo targets a paid administrator. RosterRally's console assumes a volunteer doing this on a Tuesday night: defaults everywhere, undo everywhere, nothing requires training.
2. **Conflict detection before the email goes out.** The schedule disaster is the category's most-felt wound; hard/soft conflict checking at publish time is our headline feature and demo moment.
3. **Read receipts on parent comms.** "Sent" is not "seen." Per-message delivery + read visibility ends the group-chat archaeology and is a feature parents notice too.
4. **Honest, tiny pricing.** $1.50/registration or $49/mo flat against SportsEngine's ~$799/yr entry and TeamSnap's per-team fees. The pricing page is a weapon.
5. **Parents never download an app.** Registration, schedules, volunteer claims, and messages all work from a link. App-download friction is where competitor comms die.

## Go-to-Market

1. **Season-driven search.** "youth soccer registration software," "sports club registration form," "volunteer signup sheet template" — spikes every July–August and January–February; content + templates timed to the buying window.
2. **The registrar underground.** Club volunteers congregate in sport-specific Facebook groups and subreddits (r/youthsoccer, r/littleleague) and ask for recommendations by name. Founder-led presence + a "switching from SportsEngine" migration guide.
3. **Free schedule conflict-checker.** Upload your schedule CSV, get your conflicts highlighted — the lead magnet is the demo of the headline feature.
4. **Club-to-club referral.** Clubs talk inside leagues; a season of free flat-plan per referred club spreads it through a league from one beachhead.
5. **Comparison pages.** "RosterRally vs SportsEngine," "vs TeamSnap," "vs Jersey Watch" — incumbents have deep review-site grievances to quote honestly.

## Competition

| Competitor | Price | Weakness we exploit |
|---|---|---|
| SportsEngine (NBC) | ~$799+/yr + registration fees | Priced/sold past volunteer clubs; support complaints; complexity |
| TeamSnap (Teams + ONE) | Free–$150/yr per team; club product custom-priced | Costs pushed onto every team; club-level pricing opaque; comms without read accountability |
| Jersey Watch | ~$29–99/mo | Website-first, ops-shallow: no real conflict detection or roster/schedule depth |
| LeagueApps | % of registration, sales-led | Percentage pricing + sales process; aimed at larger multi-program operations |
| Google Forms + Venmo + group texts | Free | The real incumbent: reconciliation hell, no waivers, no conflicts caught, no record of who saw what |

## Key Risks

1. **Seasonality concentration.** Revenue and signups cluster around registration windows; a missed season is a lost year for that club. Mitigation: between-season value (comms, volunteers, schedule) and annual flat plans; measure off-season activity honestly.
2. **Payments and refunds are emotional.** Parents' money + volunteers' bookkeeping = support burden. Mitigation: Stripe Connect (money lands in the club's account, not ours), self-serve refunds/credits, plain statements.
3. **Volunteer turnover.** Our champion rotates out every year or two. Mitigation: multi-admin from day one, exportable everything, and an annual "handoff kit" that makes RosterRally the thing that survives the handoff rather than dying with it.
4. **Incumbent bundling (SportsEngine/TeamSnap).** They own brand recognition. Mitigation: stay unbeatable on price transparency and registrar UX; win club-by-club through referral, not head-on marketing spend.
5. **SMS costs and compliance.** Game-day SMS at scale is a real cost line and 10DLC/TCPA obligation. Mitigation: registration-time consent capture, email-first defaults with SMS for time-sensitive messages, per-club SMS budgets.
6. **Minors' data.** Medical notes and children's information demand conservative retention, access scoping (coaches see only their roster), and COPPA-aware design — a trust requirement before it's a legal one.
