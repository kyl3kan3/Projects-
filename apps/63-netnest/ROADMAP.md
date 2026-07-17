# NetNest Roadmap

## Phase 0 — Foundations

- Plaid application (production access takes weeks — apply first);
  balances-only product scopes.
- RevenueCat project + entitlements (plus); App Store Connect / Play
  Console apps; Small Business Program enrollment.
- Neon + Upstash + Resend + domains; privacy policy written FIRST
  (it's the marketing).

## Milestone 1 — MVP (weeks 1–5)

1. Server: schema, magic-link auth, nests/members, encrypted Plaid
   item storage, link-token + exchange endpoints.
2. App shell: tabs, vault theme tokens, bundled fonts, zustand +
   SQLite cache.
3. Plaid Link flow end to end (sandbox): link → accounts → balances →
   the Line rendering real series.
4. Manual assets/debts with estimate staleness.
5. The monthly close ritual + append-only close history.
6. RevenueCat paywall: free caps enforced server-side, purchase +
   restore, entitlement mirror via webhook.
7. Web landing with the device; TestFlight build.

Exit criteria: sandbox-linked nest closes two months and the Line
draws through both closes; free cap blocks the 4th link at the
paywall; `typecheck` green in both `app` and `server`.

## Milestone 2 — v1 (weeks 6–9)

- Household sharing (invite, second member, shared Line).
- Allocation view; CSV export (Plus).
- Close reminders; Plaid webhook-driven syncs + reauth banners.
- Delete-my-data cascade + audit stubs; App Store review hardening.

## Milestone 3 — launch polish (weeks 10–12)

- Android parity pass; widget (the Number on the home screen).
- Onboarding: the three-account quick start; import from CSV.
- App Store pages: the device as the preview video, privacy nutrition
  labels matching the actual scopes.

## Growth (quarter 2+)

- Scenario slider ("at this pace, the line crosses $1M in …") — shown
  as arithmetic, never advice.
- Property estimate integrations (user-initiated only).
- Read-only advisor share links (the anti-Empower: you share, they
  don't sell).
