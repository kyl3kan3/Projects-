# Build Brief — ChairFlow

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
- **Mobile-first at 390px.** The public booking page is opened from an
  Instagram bio on a phone — it is the money surface; it must be flawless
  one-handed. Client accounts are forbidden: name + phone + saved card only.
- **Fonts must actually load** (self-hosted/embedded woff2, preloaded) — a
  silent system-font fallback is a failed build.
- **Real content everywhere** — no lorem, no gray placeholder bars; plausible
  product data in every screen and empty state.
- **Space before boxes; hairlines, not borders; 4px spacing scale; at most
  three radii** — per DESIGN_LANGUAGE.md rules 4, 5, 9, 10.
- **Webhooks follow verify -> idempotent persist -> enqueue -> ack** — the
  handler never does the work inline. Both Stripe endpoints (platform and
  Connect) and Twilio status callbacks obey it.
- **Client money never touches our balance sheet** — deposits and fees are
  PaymentIntents on the stylist's own Stripe Connect Express account, always
  carrying policy version + agreement timestamp in metadata.
- **.env.example placeholders only** — descriptive values like
  `your-stripe-secret-key`; never real or realistic-looking keys.

## Build order

1. Install the manifest's stack exactly; get an empty app booting and the
   worker (`npm run worker`) connecting to Redis.
2. Design tokens + global CSS from DESIGN.md **before any screen** — type
   roles, spacing, buttons, the day-view rows, the policy panel, the ledger
   rows and their settle motion.
3. Data model (`src/db/schema.ts` is complete — migrate it), auth for
   stylists/owners, signed link tokens, Stripe Connect Express onboarding.
4. The money spine next, end to end in test mode: booking with policy
   agreement -> SetupIntent/deposit on the Connect account -> no-show mark ->
   `capture-fee` with deposit-first logic and dispute-ready metadata ->
   waive path. This is the product; nothing else matters until it works.
5. Reminders (48h/2h), cadence scan + nudges with caps and STOP handling,
   waitlist offers with atomic claim, and the Shop rent ledger, in ROADMAP
   milestone-1 order.
6. Landing page **last**, to MARKETING_PLAYBOOK.md: name the enemy (the
   7pm no-show that cost a night's pay), show the product running within
   5 seconds, this app's one device ("The no-show that paid for itself."),
   honest receipts (never fabricated), one CTA phrase repeated verbatim:
   **"Claim your booking page"**.

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
