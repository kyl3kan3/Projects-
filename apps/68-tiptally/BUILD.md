# Build Brief — TipTally

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
  ink fill with receipt text.
- **One accent, rationed to ≤10% of any screen** — till green marks
  computed shares and closed states; money is never colored by sign.
- **The math is shown, always** — every share stores and renders its
  full derivation; cents allocate by largest-remainder so the pool sums
  EXACTLY (a cent that doesn't land is a build failure, not a rounding
  note). All money is integer cents.
- **Rule versions are append-only and effective-dated** — past shifts
  compute against the rules of their day, forever.
- **TipTally never moves money** — computation and export only; keep it
  that way in every flow.
- **Compliance notes are guidance, not legal advice** — sourced, dated,
  and worded that way.
- **Desktop-first console; the staff transparency page is mobile-first
  at 390px** with no login.
- **Fonts must actually load** (self-hosted woff2, preloaded).
- **Real content everywhere** — plausible staff, shifts, and pools; no
  lorem.
- **Space before boxes; hairlines, not borders; 4px scale; at most three
  radii** — per DESIGN_LANGUAGE.md rules 4, 5, 9, 10.
- **Webhooks follow verify → idempotent persist → enqueue → ack.**
- **.env.example placeholders only** — descriptive values, never
  realistic-looking keys.

## Build order

1. Install the manifest's stack exactly; empty app booting; worker
   connecting to Redis.
2. Design tokens + global CSS from DESIGN.md **before any screen** —
   type roles, the derivation strip, ruled totals, the tally
   keyframes.
3. Data model (`src/db/schema.ts` is complete — migrate it), auth,
   employees + staff tokens.
4. The compute engine first, pure, with the exact-sum test suite
   (points, hours weights, multi-pool, tip-shares, largest-remainder)
   — then rules UI, imports with mapping + flags, and the close flow
   feeding it.
5. The transparency page, then billing — in ROADMAP milestone-1
   order.
6. Landing page **last**, to MARKETING_PLAYBOOK.md: name the enemy
   (the manager's midnight spreadsheet), show the product running
   within 5 seconds, this app's one device ("The tip pool no one
   argues about."), honest receipts (demo data labeled), one CTA
   phrase repeated verbatim: **"Start free — 14 days"**.

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
