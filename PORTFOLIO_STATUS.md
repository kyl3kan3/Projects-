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

## Verified working (17 of 74)

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
| 44 | tenantfile | 12,027 | 100 | 101 |
| 50 | waiverwing | 10,452 | 87 | 87 |
| 51 | menocompass | 2,298 | 25 | — |

Apps 01–04 and 51 predate this process and have no test suites; they are counted
as working on the strength of having no unimplemented stubs, not on verification.

## Not built (57)

Scaffolds that compile and do nothing. 49 are "partial" — complete data model,
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
  a screen. The two that did use a browser (`28-clientdock`, `33-crewclock`) each
  found real layout defects nothing else would have caught — overlapping elements,
  sub-44px touch targets, a meter rendering the wrong figure before JS ran. Assume
  the untested ones have similar problems.

## Regenerating this

The counts come from measurement, not memory: source lines excluding comments and
blanks, files containing `Not implemented`, and bare `export {}` module stubs.
Re-derive before trusting it — and move an app between sections only after
re-running its gates.
