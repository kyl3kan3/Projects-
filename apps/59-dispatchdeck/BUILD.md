# Build Brief — DispatchDeck

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
- **No gradient fills or glows on interactive elements.** Primary button on
  the dark ground is linen fill with asphalt text.
- **One accent, rationed to ≤10% of any screen** — hazard amber is the
  thread, the detention clock, and small marks; never a surface.
- **Mobile-first at 390px.** The cab card is used one-handed at arm's length
  in a parked truck — it is the money surface; 56px primary action.
- **Fonts must actually load** (self-hosted/embedded woff2, preloaded) — a
  silent system-font fallback is a failed build.
- **Real content everywhere** — no lorem; plausible loads, lanes, and rates
  in every screen and empty state.
- **Space before boxes; hairlines, not borders; 4px spacing scale; at most
  three radii** — per DESIGN_LANGUAGE.md rules 4, 5, 9, 10.
- **Webhooks follow verify → idempotent persist → enqueue → ack** — the
  handler never does the work inline.
- **Parse honesty** — extraction confidence is surfaced, low-confidence
  fields are flagged, and a failed parse still lands the document.
- **.env.example placeholders only** — descriptive values like
  `your-stripe-secret-key`; never real or realistic-looking keys.

## Build order

1. Install the manifest's stack exactly; get an empty app booting and the
   worker (`npm run worker`) connecting to Redis.
2. Design tokens + global CSS from DESIGN.md **before any screen** — type
   roles, spacing, buttons, the hazard thread, the stamp keyframes.
3. Data model (`src/db/schema.ts` is complete — migrate it), auth, R2
   presigned uploads.
4. The load spine end to end: manual load → cab card advancing with
   stamps → POD → delivered. Then rate-con intake (inbound address +
   upload → parse → draft review → load).
5. Detention clock, packet build with completeness check, invoice send,
   paid marking — in ROADMAP milestone-1 order.
6. Landing page **last**, to MARKETING_PLAYBOOK.md: name the enemy (the
   milk crate of rate cons), show the product running within 5 seconds,
   this app's one device ("The load delivered, invoiced, and factored by
   dinner."), honest receipts (demo data labeled as demo), one CTA phrase
   repeated verbatim: **"Start free — 14 days"**.

## Definition of done

- Every item in README.md's MVP feature list works end to end.
- `npm install && npm run typecheck && npm run build` are green, and
  `npm run lint` passes, with zero console errors.
- The worker process boots, registers every job in ARCHITECTURE.md's queue
  table, and survives a Redis reconnect.
- Every screen matches DESIGN.md at 390px width, including empty, loading,
  and error states; `prefers-reduced-motion` collapses animation gracefully.
- A stranger can clone, copy `.env.example` to `.env`, fill real keys, and
  run the app with only the README's setup section.
