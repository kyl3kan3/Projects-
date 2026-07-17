# Build Brief — MatPass

**Status:** SCAFFOLD — nothing is implemented yet. Docs and stubs only. You (the building agent) are expected to produce the complete, working MVP described in this folder.

This folder is fully self-contained. It can be extracted to a fresh repository
and built with no other context. Everything you need is here.

## Read first, in this order

1. **README.md** — what the product is, who pays for it, the exact MVP feature
   list (that list is your scope; nothing more, nothing less).
2. **ARCHITECTURE.md** — stack, data model, queue/worker jobs, integrations,
   and how the pieces talk. The manifest (`package.json`) is the source of
   truth for the framework and dependencies — build on exactly that stack.
3. **DESIGN.md** — a redline spec, not inspiration: exact palette hexes, type
   roles with sizes, spacing steps, component construction (the belt bar
   especially), the stripe-seat signature detail, and motion rules.
   Deviations are build failures.
4. **ROADMAP.md** — build Phase 1 (MVP, weeks 1-4) only, in its order.
5. **DESIGN_LANGUAGE.md** and **MARKETING_PLAYBOOK.md** (copies in this
   folder) — the binding global craft and landing-page laws.

## Non-negotiable ground rules

- **Promotions are append-only.** A promotion is a permanent record with
  grader attribution; corrections append a reversal + new row, never an
  edit. This invariant gets a test before it gets UI.
- **Tuition never touches the platform.** Family billing runs on the
  school's own Stripe Connect account; card details are collected only by
  Stripe-hosted flows.
- **Attendance is never blocked by billing state.** A past-due kid still
  checks in; the desk has the conversation. Test proves it.
- **The kiosk is credential-free.** Device tokens only, revocable in one
  tap; offline check-ins sync idempotently (client keys).
- **Minors' data discipline:** guardian contact lives on the family, never
  the child; photos optional; no student-facing accounts in v1.
- **No purple, ever** (any hue ~250–310°) and **no framework-default palette
  hexes** — accents are exactly the custom-mixed values in DESIGN.md
  (`crimson #A63B32` is the one accent; belt colors are data, not chrome).
- **No emoji in product UI.** Icons are a single consistent SVG set
  (20×20 viewBox, 1.75px stroke).
- **No gradient fills or glows on interactive elements.** Primary button is
  ink fill with canvas text on this light ground.
- **One accent, rationed to <=10% of any screen.** Semantic colors carry
  meaning only.
- **Mobile-first at 390px; the kiosk gets first-class treatment on a cheap
  tablet.** Desktop is the enhancement, not the design.
- **Fonts must actually load** (self-hosted/embedded woff2, preloaded) — a
  silent system-font fallback is a failed build.
- **Real content everywhere** — no lorem, no gray placeholder bars;
  plausible (clearly fictional) school data in every screen and empty state.
- **.env.example placeholders only** — descriptive values like
  `your-stripe-secret-key`; never real or realistic-looking keys.

## Build order

1. Install the manifest's stack exactly; get an empty app booting and the
   worker process (`npm run worker`) connecting to Redis.
2. Design tokens + global CSS from DESIGN.md **before any screen** — type
   roles, spacing, buttons, rows, the belt bar, the stripe-seat keyframes.
3. `src/db/schema.ts` is already complete — generate migrations from it and
   treat it as the spine. Wire `src/db/index.ts`, env access, and auth.
4. Curriculum + roster + the belt bar, then the kiosk and attendance
   (ARCHITECTURE.md flows 1), then progression + grading events (flow 2).
5. Family billing on Connect (flow 3), retention flags (flow 4),
   announcements + MatPass billing (flow 5).
6. Product screens in ROADMAP week order, mobile-first, wiring real flows
   end to end (no mocked handlers left behind).
7. Landing page **last**, to MARKETING_PLAYBOOK.md: name the enemy (the
   index-card ledger), show the belt bar filling and a stripe seating
   within 5 seconds, honest receipts (never fabricated), one CTA phrase
   repeated verbatim: **"Start free — 14 days"**.

## Definition of done

- Every item in README.md's MVP feature list works end to end.
- `npm install && npm run typecheck && npm run build` are green, with zero
  console errors; the worker starts clean with `npm run worker`.
- The append-only promotion invariant, the billing-never-blocks-attendance
  rule, and kiosk sync idempotency are covered by tests that fail if
  violated.
- Every screen matches DESIGN.md at 390px width (and the kiosk on a tablet),
  including empty, loading, and error states; `prefers-reduced-motion`
  collapses animation gracefully.
- A stranger can clone, copy `.env.example` to `.env`, fill real keys, and
  run the app + worker with only the README's setup section.
