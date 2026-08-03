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

## Verified working (20 of 74)

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
| 33 | crewclock | 9,707 | 78 | 139 |
| 38 | duesdesk | 14,295 | 94 | 102 |
| 43 | paidwell | 11,358 | 82 | 147 |
| 44 | tenantfile | 12,027 | 100 | 101 |
| 47 | shelfsense | 11,482 | 82 | 195 |
| 49 | grantgrid | 9,765 | 70 | 82 |
| 50 | waiverwing | 10,452 | 87 | 87 |
| 51 | menocompass | 2,298 | 25 | — |

Apps 01–04 and 51 predate this process and have no test suites; they are counted
as working on the strength of having no unimplemented stubs, not on verification.

## Built, gates pass, MVP coverage unconfirmed (4)

Batch 2 was cut off part-way through by a session limit, which killed seven agents
mid-verification. Their code is substantial and complete-looking — no unimplemented
stubs — and I re-ran the gates here myself: typecheck, tests and a production build
all pass for all seven.

That is **not** the same standard as the list above. None of these agents finished
its verification pass or filed a report, so nobody has confirmed that every item in
each app's MVP feature list actually works end to end. Two are known to have been
mid-fix when they were killed: `45-rosterrally` on a client-side crash in the
registration form. `45-rosterrally` additionally did not compile — a missing import
left a cancellation path referring to an undeclared table — which I fixed here.

All seven were resumed from their transcripts once the session limit reset;
`43-paidwell`, `47-shelfsense` and `49-grantgrid` have since finished their
verification passes and moved to the verified list above.

Treat these as "probably close, unproven". Finishing them means re-running each
agent to complete its verification, not rebuilding.

| # | App | Lines | Files | Tests |
|---|-----|------:|------:|------:|
| 34 | menulift | 10,601 | 82 | 95 |
| 36 | bidboard | 13,112 | 73 | 51 |
| 45 | rosterrally | 14,917 | 87 | 49 |
| 48 | formforge | 11,953 | 92 | 151 |

## Not built (50)

Scaffolds that compile and do nothing. 42 are "partial" — complete data model,
design tokens and build config, no business logic. 8 are near-empty:

`08-subsage` · `10-streakly` · `13-inboxpilot` · `21-lingoloop` · `40-formcoach`
· `52-stimtrack` · `53-splitkit` · `54-kindesk`

`07-mergemate` was in that near-empty group (about 5 lines) and is now built, so a
from-scratch stub is no harder for an agent than filling in a partial scaffold.

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
  `43-paidwell`, `47-shelfsense`, `49-grantgrid`) found real defects nothing else
  would have caught — overlapping elements, sub-44px touch targets, a meter
  rendering the wrong figure before JS ran, a whole palette tree-shaken out of the
  built CSS while the build stayed green. Assume the untested ones are similar.

## Regenerating this

The counts come from measurement, not memory: source lines excluding comments and
blanks, files containing `Not implemented`, and bare `export {}` module stubs.
Re-derive before trusting it — and move an app between sections only after
re-running its gates.
