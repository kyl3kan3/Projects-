# Build Brief — SproutLog

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
- **No emoji in product UI** and no kids-app theater — no mascots, no
  bubble type, no rainbow states. The warmth is cream paper and good
  sentences.
- **No gradient fills or glows on interactive elements.** Primary button is
  ink fill with cream text.
- **One accent, rationed to ≤10% of any screen** — storytime blue for tap
  feedback and active states; cherry only for money/ratio/allergy.
- **log_events is append-only and is the single source of truth** — every
  register, meal count, and digest is a projection of it; corrections are
  new events, never edits.
- **The digest is email, not an app** — parents read, they don't install;
  what was sent is stored and reproducible.
- **Tuition rides the provider's own Stripe Connect account**; autopay
  failures follow the retry ladder and speak plainly.
- **Mobile-first at 390px with ≥52px touch targets** — the provider has
  one thumb free; the Day screen is the money surface.
- **Fonts must actually load** (self-hosted woff2, preloaded).
- **Real content everywhere** — plausible children (with allergy flags),
  events, and digests; no lorem.
- **Space before boxes; hairlines, not borders; 4px scale; at most three
  radii** — per DESIGN_LANGUAGE.md rules 4, 5, 9, 10.
- **Webhooks follow verify → idempotent persist → enqueue → ack.**
- **.env.example placeholders only** — descriptive values, never
  realistic-looking keys.

## Build order

1. Install the manifest's stack exactly; empty app booting; worker
   connecting to Redis.
2. Design tokens + global CSS from DESIGN.md **before any screen** —
   type roles, child chips, the day ribbon, the tap bloom.
3. Data model (`src/db/schema.ts` is complete — migrate it), auth,
   families/children.
4. The Day screen end to end: schedules → expected list → tap logging
   for every event kind → the ribbon rendering the stream → photos.
5. Digest compile/preview/send with the ledger; attendance
   projection + registers; then menus/meal sheets — in ROADMAP
   milestone-1 order.
6. Landing page **last**, to MARKETING_PLAYBOOK.md: name the enemy
   (the paper daily sheet that dies in a diaper bag), show the
   product running within 5 seconds, this app's one device ("The
   daily sheet parents actually read."), honest receipts (demo data
   labeled), one CTA phrase repeated verbatim: **"Start free — 14
   days"**.

## Definition of done

- Every item in README.md's MVP feature list works end to end.
- `npm install && npm run typecheck && npm run build` are green, and
  `npm run lint` passes, with zero console errors.
- The worker process boots, registers every job in ARCHITECTURE.md's
  queue table, and survives a Redis reconnect.
- Every screen matches DESIGN.md at 390px width, including empty,
  loading, and error states; `prefers-reduced-motion` collapses
  animation gracefully.
- A stranger can clone, copy `.env.example` to `.env`, fill real keys,
  and run the app with only the README's setup section.
