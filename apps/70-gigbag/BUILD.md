# Build Brief — GigBag

**Status:** SCAFFOLD — nothing is implemented yet. Docs and stubs only. You (the building agent) are expected to produce the complete, working MVP described in this folder.

This folder is fully self-contained. It can be extracted to a fresh repository
and built with no other context. Everything you need is here. This is a
**mobile-first product**: an Expo app (repo root) plus a small Next.js
server (`server/`) for the API, booker links, share pages, and landing.

## Read first, in this order

1. **README.md** — what the product is, who pays for it, the exact MVP feature
   list (that list is your scope; nothing more, nothing less).
2. **ARCHITECTURE.md** — app + server split, data model, Connect deposits,
   RevenueCat entitlements. The two manifests (`package.json`,
   `server/package.json`) are the source of truth for dependencies.
3. **DESIGN.md** — a redline spec, not inspiration: exact palette hexes, type
   roles with sizes, the marquee strip, and motion rules. Deviations are
   build failures.
4. **ROADMAP.md** — build milestone 1 (MVP) only, in its order.
5. **DESIGN_LANGUAGE.md** and **MARKETING_PLAYBOOK.md** (copies in this
   folder) — the binding global craft and landing-page laws.

## Non-negotiable ground rules

- **No purple, ever** (any hue ~250–310°) and **no framework-default palette
  hexes** — accents are exactly the custom-mixed values in DESIGN.md.
- **No emoji in product UI** and no music-app cliché — no waveforms, no
  neon EQ bars.
- **One accent (reverb teal), rationed** — the marquee strip and small
  marks; redlight speaks only for conflicts.
- **The pipeline enforces the discipline** — confirmed requires signed +
  deposited (or the logged skip-protection tap); holds conflict
  visibly with the other gig named.
- **Gig money never touches GigBag** — deposits are PaymentIntents on
  the band's own Stripe Connect account; balances record honestly by
  method (cash stays cash).
- **Splits sum exactly** — integer cents, largest-remainder; a lost
  cent is a bug. Splits are recorded, never moved.
- **Entitlements enforced server-side** from the RevenueCat-mirrored
  plan; downgrades go read-only, never destructive.
- **Offline is first-class** — gig sheets and setlists render from the
  SQLite cache; the music-stand view keeps the screen awake.
- **Fonts bundled as app assets** (expo-font), loaded before first
  paint; web self-hosts woff2.
- **Real content everywhere** — plausible gigs, songs, and splits; no
  lorem.
- **Webhooks (Stripe + RevenueCat) follow verify → idempotent persist →
  enqueue → ack.**
- **.env.example placeholders only** — descriptive values, never
  realistic-looking keys.

## Build order

1. `server/`: schema migrate, magic-link auth, bands/members/gigs API;
   worker booting.
2. App shell: expo-router tabs, green-room tokens, bundled fonts,
   SQLite cache.
3. The pipeline end to end: gigs, calendar with conflict warnings,
   the gig sheet, marquee strips.
4. Setlists + the music-stand share view; then contracts + deposits
   (sign → hash → Connect PI → confirmed).
5. Payments + splits with the exact-sum test; the settle-up view;
   RevenueCat paywall + server gates.
6. Web landing **last**, to MARKETING_PLAYBOOK.md: name the enemy
   (the gig that existed only in a DM thread), the four-beat device,
   honest receipts (demo data labeled), one CTA phrase repeated
   verbatim: **"Get GigBag free"**.

## Definition of done

- Every item in README.md's MVP feature list works end to end (Stripe
  test mode).
- `npm run typecheck` green in both the app and `server/`;
  `npm run build` green in `server/`; the Expo app boots in a dev
  client with zero console errors.
- The worker registers every job in ARCHITECTURE.md's table and
  survives a Redis reconnect.
- Every screen matches DESIGN.md, including empty, loading, error,
  AND offline states; reduced-motion renders final states instantly.
- A stranger can clone, fill both `.env.example`s, and run app +
  server with only the README's setup section.
