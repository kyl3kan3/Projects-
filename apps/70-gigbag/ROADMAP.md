# GigBag Roadmap

## Phase 0 — Foundations

- RevenueCat project + entitlements (band); App Store Connect / Play
  Console apps; Small Business Program.
- Stripe Connect (Standard) application for band deposit accounts.
- Neon + Upstash + Resend + domains; the booking-agreement template
  reviewed against a working band's real contract.

## Milestone 1 — MVP (weeks 1–5): the pipeline

1. Server: schema, magic-link auth, bands/members/venues; the app
   shell (tabs, green-room tokens, bundled fonts, SQLite cache).
2. Gigs: pipeline states, the calendar with hold conflicts, the gig
   sheet.
3. Songs + setlists + the builder with live total time; the
   music-stand share view.
4. Contracts + deposits: render → booker link → sign (hash, ip) →
   deposit on Connect → confirmed; the skip-protection path logged.
5. Payments + splits with exact-cent allocation; the settle-up view.
6. RevenueCat paywall + server-side entitlement gates.
7. Web landing with the device; TestFlight build.

Exit criteria: a gig runs inquiry → hold (conflict warning verified) →
confirmed (signed + test-mode deposit) → played → paid with splits
summing exactly; the setlist share renders the music-stand view;
`typecheck` green in app and server.

## Milestone 2 — v1 (weeks 6–9)

- Stage plots + input lists with share links and PDF export.
- Reminders (advance sheet, day-of, settle-up nudges).
- The public request page with the real-availability date checker.
- Sub management with fixed rates; per-gig lineups.

## Milestone 3 — launch polish (weeks 10–12)

- Android parity; offline hardening; the year summary + CSV exports.
- App Store pages with the device as preview video.
- Booker-page polish (the forward-to-a-wedding-planner bar).

## Growth (quarter 2+)

- Charts attachments on songs (PDF per key).
- Calendar feeds (ICS) and Google Calendar sync.
- Multi-band membership (the bassist in four bands).
