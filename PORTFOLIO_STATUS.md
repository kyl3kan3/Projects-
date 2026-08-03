# Portfolio status

Two different claims, kept apart on purpose because the first sounds like the
second and is not:

- **Builds** — the app compiles. `tools/build-all.sh` proves this for all 77
  buildable units; the last run is in `BUILD_STATUS.txt`.
- **Works** — the MVP feature list in the app's README is implemented, and it was
  exercised against a real database, not just compiled.

A build passing is weak evidence. Every app in the verified list below had a green
production build while real defects sat in it: backups that would silently never
run, a referral queue that deadlocked under launch-day load, magic-link login
broken outright, certificate-expiry alerts that fired once and then went quiet
forever. All were found by running the thing.

## Verified working (30 of 74)

Each was re-checked here after its build agent reported: line count, absence of
unimplemented stubs, `tsc --noEmit`, `npm test`, and a production build.

| # | App | Lines | Files | Tests |
|---|-----|------:|------:|------:|
| 01 | clipforge | 4,017 | 50 | — |
| 02 | dunly | 3,648 | 53 | — |
| 03 | briefcast | 2,801 | 50 | — |
| 04 | lenscrm | 2,269 | 56 | — |
| 05 | pulsewatch | 6,972 | 69 | 39 |
| 06 | vaultback | 10,089 | 84 | 60 |
| 07 | mergemate | 12,617 | 68 | 153 |
| 12 | papertrail | 9,318 | 69 | 193 |
| 15 | launchlist | 9,415 | 86 | 106 |
| 17 | trustbadge | 8,831 | 88 | 163 |
| 24 | tradelog | 10,789 | 102 | 197 |
| 28 | clientdock | 9,273 | 84 | 66 |
| 30 | cloudspend | 11,135 | 92 | 112 |
| 31 | quotefox | 13,346 | 101 | 92 |
| 32 | permitpath | 12,143 | 92 | 63 |
| 33 | crewclock | 9,707 | 78 | 139 |
| 34 | menulift | 10,803 | 83 | 97 |
| 35 | ledgerlens | 10,794 | 96 | 94 |
| 36 | bidboard | 13,785 | 74 | 95 |
| 37 | safetydeck | 13,657 | 107 | 71 |
| 38 | duesdesk | 14,295 | 94 | 102 |
| 42 | schemasentry | 13,164 | 88 | 130 |
| 43 | paidwell | 11,358 | 82 | 147 |
| 44 | tenantfile | 12,027 | 100 | 101 |
| 45 | rosterrally | 16,282 | 96 | 132 |
| 47 | shelfsense | 11,482 | 82 | 195 |
| 48 | formforge | 11,966 | 92 | 184 |
| 49 | grantgrid | 9,765 | 70 | 82 |
| 50 | waiverwing | 10,452 | 87 | 87 |
| 51 | menocompass | 2,298 | 25 | — |

Apps 01–04 and 51 predate this process and have no test suites; they are counted
as working on the strength of having no unimplemented stubs, not on verification.

## Batch 2, and why the resumed pass was worth running (8 of 8 done)

A session limit killed seven batch-2 agents mid-verification. Their code was
substantial and complete-looking, and the gates passed for all seven — which was
exactly the trap this file exists to name. All seven were resumed from their
transcripts, and between them they found and fixed some 70 defects that a green
build had been hiding:

- a guest QR menu that was never actually cached, so every scan hit the database
  and the app's whole speed premise was fictional
- a portal link that every reminder email silently invalidated, in a product whose
  users keep the first email
- volunteer claims that always failed, behind a catch-all reporting "slot is full"
- `"use server"` files exporting plain objects, which throws only at runtime and
  500'd an entire dashboard on first save
- an untyped bind parameter that made creating a menu, section or dish impossible,
  hidden because the seed inserted rows directly
- every restaurant saved with timezone `UTC`, breaking dayparts and auto-restore
- a cross-tenant audit write landing in the wrong practice's ledger before the
  cipher rejected the operation

Formforge's test count reads 184 because it carries two suites: 151 unit tests and
33 integration tests needing a real database (`npm run test:db`).

## Not built (50)

Scaffolds that compile and do nothing. 42 are "partial" — complete data model,
design tokens and build config, no business logic. 8 are near-empty:

`08-subsage` · `10-streakly` · `13-inboxpilot` · `21-lingoloop` · `40-formcoach`
· `52-stimtrack` · `53-splitkit` · `54-kindesk`

`07-mergemate` was in that near-empty group (about 5 lines) and is now built, so a
from-scratch stub is no harder for an agent than filling in a partial scaffold.

## One defect the design system has, found four times independently

`DESIGN_LANGUAGE.md` requires WCAG AA everywhere. Several apps' `DESIGN.md` then
specifies a faint grey token that does not reach AA on the ground it is used
against — and specifies it for exactly the 11-13px labels, axis ticks and
placeholders where contrast matters most.

Four agents found this separately and each raised the token, documenting the
divergence in its own `globals.css`: `43-paidwell` (4.1:1 and 2.5:1),
`49-grantgrid`, `31-quotefox` (3.1:1 on iron, 2.9:1 on panels) and `30-cloudspend`
(3.09:1 on the night ground). Each was right to follow the stated accessibility
floor over the stated hex, but four apps solving the same problem four times means
the source documents disagree with each other, not that four agents each made a
judgment call.

Now fixed at the source: `DESIGN_LANGUAGE.md` states that its AA floor outranks a
specific hex, and the brief carries that as the one documented exception to
`DESIGN.md` being a redline spec. It also says to measure the text at the size it
actually ships — a token that passes at 16px body can fail the 11px label it is
really used for, which is why every instance was caught by looking at a rendered
screen rather than by reading the spec.

`37-safetydeck` is the fifth instance and the most instructive, because its agent
measured the token honestly (3.19:1) and then justified keeping it for the "faint"
role its `DESIGN.md` names — timestamps and placeholders. Reasonable, except the
same token also coloured inactive tab-bar labels, which are navigation. Raised here
to 4.96:1 on the ground and 4.53:1 on panels. The lesson generalises: a
contrast decision has to be checked against where the token is *used*, not the role
it was *assigned*.

## What is untested everywhere

These are environment limits, not omissions, and they apply to every app above:

- **Stripe.** No API keys exist here. Webhook *handling* is verified with synthetic
  events and signature rejection; Checkout and Portal *creation* never ran.
- **Email and SMS.** No Resend or Twilio credentials. Message content is asserted;
  nothing was delivered, and no bounce handling exists.
- **Object storage.** No S3/R2 bucket. Apps that need it ship a storage interface
  with a working local or Postgres driver; the S3 path is unexercised.
- **Visual correctness.** Chromium *is* available here — but a mistake in
  `tools/AGENT_BRIEF.md` told the first batch otherwise, so most of these apps had
  their layout checked by reading rendered HTML and CSS rather than by looking at
  a screen. Every app that *did* drive Chromium (`28-clientdock`, `33-crewclock`,
  `34-menulift`, `36-bidboard`, `43-paidwell`, `45-rosterrally`, `47-shelfsense`,
  `48-formforge`, `49-grantgrid`), and every app built since has used one as a
  matter of course found real defects nothing else
  would have caught — overlapping elements, sub-44px touch targets, a meter
  rendering the wrong figure before JS ran, a whole palette tree-shaken out of the
  built CSS while the build stayed green. Assume the untested ones are similar.

## Regenerating this

The counts come from measurement, not memory: source lines excluding comments and
blanks, files containing `Not implemented`, and bare `export {}` module stubs.
Re-derive before trusting it — and move an app between sections only after
re-running its gates.
