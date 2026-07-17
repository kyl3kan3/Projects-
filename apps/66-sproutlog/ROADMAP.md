# SproutLog Roadmap

## Phase 0 — Foundations

- Domain, Resend verification, Neon + Upstash + R2, Stripe products;
  Connect (Standard) application for provider tuition accounts.
- CACFP meal-component reference data; two state register formats
  (launch states) as export templates.

## Milestone 1 — MVP (weeks 1–4): taps → digest

1. Provider auth + settings; families + children (allergies,
   pickups, schedules, tuition rates).
2. The Day screen: expected-children list, tap logging for all event
   kinds, the ribbon, ratio header, photo uploads.
3. Menus + the meal component sheet.
4. Digest compilation + send ledger + the preview/edit screen.
5. Attendance projection + the registers view.
6. Billing (SproutLog's own): trial, three plans, portal, webhooks.
7. Landing page per MARKETING_PLAYBOOK.md with the tap-to-digest
   device.

Exit criteria: a full demo day logged one-thumbed; the digest
compiles into readable sentences with the photo and sends;
the attendance register matches the taps; `typecheck`/`build`/`lint`
green.

## Milestone 2 — v1 (weeks 5–8): money + compliance

- Tuition invoices on Connect with autopay, retry ladder, late fees,
  past-due flags; parent pay links.
- Meal-count tables (CACFP claim shape) + exports.
- Incident reports with signature capture + PDFs.
- Binder export (date-range zip).

## Milestone 3 — polish (weeks 9–12)

- Assistant logins (Orchard); logged_by attribution.
- Digest photo galleries; parent digest preferences.
- Menu templates library; allergy cross-checks on meal sheets
  ("Theo's allergy: dairy — this menu includes milk").

## Growth (quarter 2+)

- Waitlist + enrollment pipeline for providers with demand.
- State-format packs for more states; food-program claim e-file
  where states allow.
- Substitute-caregiver day passes (temporary logins with narrow
  scope).
