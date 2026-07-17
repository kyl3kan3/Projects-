# Build Brief — RecallDesk

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
   roles with sizes, spacing steps, component construction, the chair-fill
   signature detail, and motion rules. Deviations are build failures.
4. **ROADMAP.md** — build Phase 1 (MVP, weeks 1-4) only, in its order.
5. **DESIGN_LANGUAGE.md** and **MARKETING_PLAYBOOK.md** (copies in this
   folder) — the binding global craft and landing-page laws.

## Non-negotiable ground rules

- **The attribution ledger is conservative or it is worthless.** A booking
  with no qualifying touch inside the window gets no attribution row — no
  exceptions, no "estimated" second number anywhere in the product. This
  invariant gets a test before it gets UI.
- **One consent chokepoint.** Every outbound touch passes a single function
  that enforces channel consent, opt-outs, bounce/fail flags, do-not-contact,
  quiet hours, and touch caps. STOP is honored permanently. Each block
  condition has a test.
- **PHI discipline everywhere:** job payloads carry IDs only (no PHI in
  Redis); no PHI in emails' subjects/notification copy, logs, error reports,
  or analytics.
- **No purple, ever** (any hue ~250–310°) and **no framework-default palette
  hexes** — accents are exactly the custom-mixed values in DESIGN.md
  (`aqua #3F8FA0` is the one accent).
- **No emoji in product UI.** Icons are a single consistent SVG set
  (20×20 viewBox, 1.75px stroke).
- **No gradient fills or glows on interactive elements.** Primary button is
  ink fill with porcelain text on this light ground.
- **One accent, rationed to <=10% of any screen.** Semantic colors carry
  meaning only.
- **Mobile-first at 390px.** Desktop is the enhancement, not the design.
- **Fonts must actually load** (self-hosted/embedded woff2, preloaded) — a
  silent system-font fallback is a failed build.
- **Real content everywhere** — no lorem, no gray placeholder bars; plausible
  (clearly fictional) practice data in every screen and empty state.
- **.env.example placeholders only** — descriptive values like
  `your-stripe-secret-key`; never real or realistic-looking keys.

## Build order

1. Install the manifest's stack exactly; get an empty app booting and the
   worker process (`npm run worker`) connecting to Redis.
2. Design tokens + global CSS from DESIGN.md **before any screen** — type
   roles, spacing, buttons, rows, the week-strip, the chair-fill keyframes.
3. `src/db/schema.ts` is already complete — generate migrations from it and
   treat it as the spine. Wire `src/db/index.ts`, env access, and auth.
4. Import pipeline end to end (upload -> recipe parse -> preview -> commit ->
   overdue recompute), then the overdue list (ARCHITECTURE.md flow 1).
5. Campaigns, the consent chokepoint, booking links, and provider webhooks
   (flows 2-3), then queue + attribution + dashboard (flows 4-5), then
   billing (flow 6).
6. Product screens in ROADMAP week order, mobile-first, wiring real flows
   end to end (no mocked handlers left behind).
7. Landing page **last**, to MARKETING_PLAYBOOK.md: name the enemy (the
   empty hygiene chair at 10am), show the chair filling within 5 seconds,
   honest receipts (never fabricated), one CTA phrase repeated verbatim:
   **"See your overdue list"**.

## Definition of done

- Every item in README.md's MVP feature list works end to end.
- `npm install && npm run typecheck && npm run build` are green, with zero
  console errors; the worker starts clean with `npm run worker`.
- The attribution conservatism and every consent-block condition are covered
  by tests that fail if violated.
- Every screen matches DESIGN.md at 390px width, including empty, loading,
  and error states; `prefers-reduced-motion` collapses animation gracefully.
- A stranger can clone, copy `.env.example` to `.env`, fill real keys, and
  run the app + worker with only the README's setup section.
