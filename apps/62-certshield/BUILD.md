# Build Brief — CertShield

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
  (20×20 viewBox, 1.75px stroke). The compliance seal is the one
  ornament, and it is earned, not decorative.
- **No gradient fills or glows on interactive elements.** Primary button is
  ink fill with stock text.
- **One accent, rationed to ≤10% of any screen** — seal gold marks
  compliance only.
- **Verdicts are sentences** — every deficiency renders its named reason
  verbatim from the engine; no icon-only states, no unexplained badges.
- **Parse honesty** — per-field confidence stored and surfaced; below
  threshold goes to human review; a certificate never silently enters
  compliance; a failed parse still lands the PDF.
- **Certificates are immutable evidence** — stored with sha256, never
  overwritten; replacements are new rows.
- **Desktop-first console (1280px), but the vendor portal is mobile-first
  at 390px** — agents' assistants upload from phones.
- **Fonts must actually load** (self-hosted woff2, preloaded).
- **Real content everywhere** — plausible vendors, carriers, and limits;
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
   roles, table rules, the seal and its press keyframes.
3. Data model (`src/db/schema.ts` is complete — migrate it), auth, R2,
   vendor upload tokens.
4. The engine first, pure: evaluate() with exhaustive tests (limits,
   windows, flags, missing lines — every deficiency sentence asserted).
   Then intake → parse → review queue feeding it.
5. The chasing ladder with its exactly-once ledger and stop-on-
   compliance; dashboard + vendor detail; then billing — in ROADMAP
   milestone-1 order.
6. Landing page **last**, to MARKETING_PLAYBOOK.md: name the enemy (the
   COI folder that was current in March), show the product running
   within 5 seconds, this app's one device ("Expired COIs caught before
   the claim."), honest receipts (demo data labeled), one CTA phrase
   repeated verbatim: **"Start free — 14 days"**.

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
