# Build Brief — UnitKeeper

**Status:** SCAFFOLD — nothing is implemented yet. Docs and stubs only. You (the building agent) are expected to produce the complete, working MVP described in this folder.

This folder is fully self-contained. It can be extracted to a fresh repository
and built with no other context. Everything you need is here.

## Read first, in this order

1. **README.md** — what the product is, who pays for it, the exact MVP feature
   list (that list is your scope; nothing more, nothing less).
2. **ARCHITECTURE.md** — stack, data model, services, integrations, and how the
   pieces talk. The manifest (`package.json`) is the source of truth for the
   framework and dependencies — build on exactly that stack.
3. **DESIGN.md** — a redline spec, not inspiration: exact palette hexes, type
   roles with sizes, spacing steps, component construction, the one signature
   detail, and motion rules. Deviations are build failures.
4. **ROADMAP.md** — build milestone 1 (MVP) only, in its order (the lien
   engine is milestone 2 — scaffold its data model and rail component, but
   the MVP line is map → move-in → autopay → ladder).
5. **DESIGN_LANGUAGE.md** and **MARKETING_PLAYBOOK.md** (copies in this
   folder) — the binding global craft and landing-page laws.

## Non-negotiable ground rules

- **No purple, ever** (any hue ~250–310°) and **no framework-default palette
  hexes** — accents are exactly the custom-mixed values in DESIGN.md.
- **No emoji in product UI.** Icons are a single consistent SVG set
  (20×20 viewBox, 1.75px stroke).
- **No gradient fills or glows on interactive elements.** Primary button is
  ink fill with concrete text.
- **One accent, rationed** — rolldoor orange marks overdue and active;
  the map's fills ARE the status system.
- **The ledger is append-only** — corrections are new entries; the lien
  packet prints it verbatim.
- **The lien engine never auto-executes** — it computes dates with
  citations, generates documents, and enforces hard stops in the UI;
  the owner acts. A state without reviewed rules says so plainly.
- **The late ladder fires exactly once per step** and reverses cleanly
  on payment.
- **Rent rides the owner's own Stripe Connect account** (push ACH in
  onboarding copy).
- **Desktop-first console (the map wants width); the tenant link is
  mobile-first at 390px.**
- **Fonts must actually load** (self-hosted woff2, preloaded).
- **Real content everywhere** — plausible units, tenants, and ledgers;
  no lorem.
- **Space before boxes; hairlines, not borders; 4px scale; at most three
  radii** — per DESIGN_LANGUAGE.md rules 4, 5, 9, 10.
- **Webhooks follow verify → idempotent persist → enqueue → ack.**
- **.env.example placeholders only** — descriptive values, never
  realistic-looking keys.

## Build order

1. Install the manifest's stack exactly; empty app booting; worker
   connecting to Redis.
2. Design tokens + global CSS from DESIGN.md **before any screen** —
   the map unit fills, the door-flip wipe, the timeline rail.
3. Data model (`src/db/schema.ts` is complete — migrate it), auth,
   the map editor + view.
4. Move-in end to end (lease render → tokenized sign + hash →
   payment setup → prorated charge → code → occupied), then the
   ledger.
5. Autopay + the late ladder with its exactly-once semantics and
   payment reversal; the delinquency board; then billing — in
   ROADMAP milestone-1 order.
6. Landing page **last**, to MARKETING_PLAYBOOK.md: name the enemy
   (the lien deadline computed on a napkin), show the product running
   within 5 seconds, this app's one device ("The lien clock that runs
   itself."), honest receipts (demo data labeled), one CTA phrase
   repeated verbatim: **"Start free — 14 days"**.

## Definition of done

- Every item in README.md's MVP feature list works end to end.
- `npm install && npm run typecheck && npm run build` are green, and
  `npm run lint` passes, with zero console errors.
- The worker process boots, registers every job in ARCHITECTURE.md's
  queue table, and survives a Redis reconnect.
- Every screen matches DESIGN.md, including empty, loading, and error
  states; `prefers-reduced-motion` collapses animation gracefully.
- A stranger can clone, copy `.env.example` to `.env`, fill real keys,
  and run the app with only the README's setup section.
