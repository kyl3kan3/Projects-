# TipTally Roadmap

## Phase 0 — Foundations

- Domain, Resend verification, Neon + Upstash, Stripe products.
- Sample POS exports (Toast/Square/Clover CSV shapes) as import
  fixtures; compliance-note content for launch states, sourced and
  dated.

## Milestone 1 — MVP (weeks 1–4): rules → import → shown math

1. Auth, groups/restaurants, employees, roles.
2. Pools + effective-dated rule versions with the sentence renderer.
3. Import sources with saved column maps; CSV parse → entries →
   matching → flags.
4. The shift close: flag resolution, pool totals, compute-shares with
   largest-remainder cent allocation and stored derivations (the
   exact-sum property is the test suite's centerpiece).
5. Shares view + the staff transparency page with derivation strips.
6. Billing: trial, three plans, portal, webhooks.
7. Landing page per MARKETING_PLAYBOOK.md with the import-to-
   derivation device.

Exit criteria: a fixture shift imports, closes, and every cent of the
pool lands in exactly one share; the transparency page renders the
derivation verbatim; a March shift recomputed after an April rule
change still uses March's rules; `typecheck`/`build`/`lint` green.

## Milestone 2 — v1 (weeks 5–8)

- Disputes: window, queue, uphold/adjust with audit.
- Payroll exports (Gusto/ADP/Paychex formats) + period locks.
- Compliance notes surfaced contextually by state.
- Multi-pool shifts (FOH + bar) and tip-share transfers.

## Milestone 3 — polish (weeks 9–12)

- Multi-location groups; rule libraries shared across locations.
- Staff email/SMS notification opt-ins on close.
- Import health: per-source parse history and drift warnings.

## Growth (quarter 2+)

- Direct POS API imports (Toast partner API first).
- Payout-rail partnerships (hand the computed shares to Kickfin et
  al. — still never touching money ourselves).
- Scheduling-suite imports (7shifts hours).
