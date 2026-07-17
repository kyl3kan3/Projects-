# Build Brief — CoopClass

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
4. **ROADMAP.md** — build milestone 1 (MVP) only, in its order.
5. **DESIGN_LANGUAGE.md** and **MARKETING_PLAYBOOK.md** (copies in this
   folder) — the binding global craft and landing-page laws.

## Non-negotiable ground rules

- **No purple, ever** (any hue ~250–310°) and **no framework-default palette
  hexes** — accents are exactly the custom-mixed values in DESIGN.md.
- **No emoji in product UI.** Icons are a single consistent SVG set
  (20×20 viewBox, 1.75px stroke).
- **No gradient fills or glows on interactive elements.** Primary button is
  ink fill with cream text.
- **One accent, rationed to ≤10% of any screen** — navy for active states;
  brick speaks only for conflicts and lapsed checks.
- **The enrollment transaction is the product** — window, capacity, grade
  band, prerequisite, student-period, and room/teacher checks run atomically
  inside one transaction; failures name the exact reason. Two families
  racing for the last seat must produce exactly one enrollment.
- **Discount math is shown, never summarized** — every discount is an
  explicit invoice line with a name.
- **Mobile-first at 390px** for the family registration portal (parents
  register from phones); admin surfaces must work at 768px+.
- **Fonts must actually load** (self-hosted woff2, preloaded).
- **Real content everywhere** — plausible classes, families, and schedules;
  no lorem.
- **Space before boxes; hairlines, not borders; 4px scale; at most three
  radii** — per DESIGN_LANGUAGE.md rules 4, 5, 9, 10.
- **Webhooks follow verify → idempotent persist → enqueue → ack.**
- **.env.example placeholders only** — descriptive values, never
  realistic-looking keys.

## Build order

1. Install the manifest's stack exactly; empty app booting; worker
   connecting to Redis.
2. Design tokens + global CSS from DESIGN.md **before any screen** — type
   roles, the schedule rules, the capacity stamp and its keyframes.
3. Data model (`src/db/schema.ts` is complete — migrate it), auth (both
   audiences), co-op settings.
4. The enrollment transaction end to end with a race test (two
   concurrent registrations, one seat), then the portal flow: catalog →
   per-student picks → conflict blocks → invoice build → Checkout.
5. Waitlists, schedule grid, binder, digest — in ROADMAP milestone-1
   order (binder and digest are milestone 2 if time presses; the MVP
   line is registration + payment).
6. Landing page **last**, to MARKETING_PLAYBOOK.md: name the enemy (the
   shared spreadsheet at the folding table), show the product running
   within 5 seconds, this app's one device ("Registration night without
   the folding-table chaos."), honest receipts (demo data labeled), one
   CTA phrase repeated verbatim: **"Start free — 14 days"**.

## Definition of done

- Every item in README.md's MVP feature list works end to end.
- `npm install && npm run typecheck && npm run build` are green, and
  `npm run lint` passes, with zero console errors.
- The worker process boots, registers every job in ARCHITECTURE.md's queue
  table, and survives a Redis reconnect.
- Every screen matches DESIGN.md, including empty, loading, and error
  states; `prefers-reduced-motion` collapses animation gracefully.
- A stranger can clone, copy `.env.example` to `.env`, fill real keys, and
  run the app with only the README's setup section.
