# Build Brief — RFPRadar

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
- **No gradient fills or glows on interactive elements.** Primary button on a
  dark ground is off-white fill with ink text; on light grounds, ink fill.
- **One accent, rationed to ≤10% of any screen.** Semantic colors carry
  meaning only.
- **No score without reasons.** Every fit score must expand to its verbatim
  factor list; rendering a bare score is a build failure.
- **Link-and-snapshot is inviolable.** Library edits never change a
  pursuit's frozen content; submitted history is immutable.
- **Poll politely.** Per-source schedules, hash short-circuits, honest
  per-source health states. Hammering a portal is a build failure.
- **Mobile-first at 390px.** Desktop is the enhancement, not the design.
- **Fonts must actually load** (self-hosted/embedded woff2, preloaded) — a
  silent system-font fallback is a failed build.
- **Real content everywhere** — no lorem, no gray placeholder bars; plausible
  product data in every screen and empty state.
- **Space before boxes; hairlines, not borders; 4px spacing scale; at most
  three radii** — per DESIGN_LANGUAGE.md rules 4, 5, 9, 10.
- **Webhooks follow verify -> idempotent persist -> enqueue -> ack** — the
  handler never does the work inline.
- **.env.example placeholders only** — descriptive values like
  `your-stripe-secret-key`; never real or realistic-looking keys.

## Build order

1. Install the manifest's stack exactly; get an empty app booting and the
   worker (`npm run worker`) connecting to Redis.
2. Design tokens + global CSS from DESIGN.md **before any screen** — type
   roles, spacing, buttons, cards, rows, the 6am-find keyframes.
3. Data model (`src/db/schema.ts` is complete — migrate it), auth, ICS
   tokens, and API/services per ARCHITECTURE.md.
4. The ingestion spine next, end to end against live SAM.gov data:
   poll -> normalize -> upsert -> score with reasons -> the radar screen.
   Idempotent re-polls and per-source health are part of this milestone,
   not polish.
5. Product screens in ROADMAP milestone-1 order, mobile-first, wiring
   real flows end to end (no mocked handlers left behind): radar, notice
   reader, pursuits with scorecards, deadlines + ICS, the library with
   snapshot semantics.
6. Landing page **last**, to MARKETING_PLAYBOOK.md: name the enemy (the
   tender that got away), show the product running within 5 seconds, this
   app's one device ("The tender you'd have missed, found at 6am."),
   honest receipts (never fabricated), one CTA phrase repeated verbatim:
   **"Start free — 14 days"**.

## Definition of done

- Every item in README.md's MVP feature list works end to end.
- `npm install && npm run typecheck && npm run build` are green, and
  `npm run lint` passes, with zero console errors.
- The worker process boots, registers every job in ARCHITECTURE.md's queue
  table, and survives a Redis reconnect.
- The invariant tests pass: no bare scores, snapshot immutability,
  ingestion idempotency, exactly-once reminders.
- Every screen matches DESIGN.md at 390px width, including empty, loading,
  and error states; `prefers-reduced-motion` collapses animation gracefully.
- A stranger can clone, copy `.env.example` to `.env`, fill real keys, and
  run the app with only the README's setup section.
