# Build Brief — WrenchView

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
- **No gradient fills or glows on interactive elements.**
- **Verdict colors are semantic only** — green/yellow/red carry inspection
  meaning and never decorate chrome; bronze is the one accent, rationed.
- **Two grounds, one system** — shop surfaces on graphite, the customer
  report on paper; the report reads like a clear letter, never an
  invoice ambush.
- **The approval trail is immutable rows** — decision, timestamp, ip,
  user-agent per line; estimate edits after send are audit-logged.
- **The bay flow must beat paper** — tablet-first at 768–1024px, 64px
  verdict targets, photo upload never blocks the next tap.
- **The customer report is mobile-first at 390px** with no login and no
  app.
- **Fonts must actually load** (self-hosted woff2, preloaded).
- **Real content everywhere** — plausible vehicles, findings with
  measurements, and photos; no lorem.
- **Space before boxes; hairlines, not borders; 4px scale; at most three
  radii** — per DESIGN_LANGUAGE.md rules 4, 5, 9, 10.
- **Webhooks (Stripe + Twilio) follow verify → idempotent persist →
  enqueue → ack.**
- **.env.example placeholders only** — descriptive values, never
  realistic-looking keys.

## Build order

1. Install the manifest's stack exactly; empty app booting; worker
   connecting to Redis.
2. Design tokens + global CSS from DESIGN.md **before any screen** —
   both grounds, the verdict rail, the snap keyframes.
3. Data model (`src/db/schema.ts` is complete — migrate it), auth,
   device tokens, R2 presign + process-media.
4. The bay flow end to end (template → taps → photos → measurements →
   tech_done), then findings/estimate, then the customer report with
   the approvals trail.
5. The advisor board with read receipts and waiting flags; then
   billing — in ROADMAP milestone-1 order.
6. Landing page **last**, to MARKETING_PLAYBOOK.md: name the enemy
   (the clipboard estimate described over phone tag), show the product
   running within 5 seconds, this app's one device ("The estimate they
   approve from the waiting room."), honest receipts (demo data
   labeled), one CTA phrase repeated verbatim: **"Book a 10-minute
   demo"**.

## Definition of done

- Every item in README.md's MVP feature list works end to end.
- `npm install && npm run typecheck && npm run build` are green, and
  `npm run lint` passes, with zero console errors.
- The worker process boots, registers every job in ARCHITECTURE.md's
  queue table, and survives a Redis reconnect.
- Every screen matches DESIGN.md at its target width (tablet for the
  bay, 390px for the report), including empty, loading, and error
  states; `prefers-reduced-motion` collapses animation gracefully.
- A stranger can clone, copy `.env.example` to `.env`, fill real keys,
  and run the app with only the README's setup section.
