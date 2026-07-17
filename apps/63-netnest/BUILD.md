# Build Brief — NetNest

**Status:** SCAFFOLD — nothing is implemented yet. Docs and stubs only. You (the building agent) are expected to produce the complete, working MVP described in this folder.

This folder is fully self-contained. It can be extracted to a fresh repository
and built with no other context. Everything you need is here. This is a
**mobile-first product**: an Expo app (repo root) plus a small Next.js
server (`server/`).

## Read first, in this order

1. **README.md** — what the product is, who pays for it, the exact MVP feature
   list (that list is your scope; nothing more, nothing less).
2. **ARCHITECTURE.md** — app + server split, data model, Plaid scopes,
   RevenueCat entitlements. The two manifests (`package.json`,
   `server/package.json`) are the source of truth for dependencies.
3. **DESIGN.md** — a redline spec, not inspiration: exact palette hexes, type
   roles with sizes, the Line's construction, and motion rules. Deviations
   are build failures.
4. **ROADMAP.md** — build milestone 1 (MVP) only, in its order.
5. **DESIGN_LANGUAGE.md** and **MARKETING_PLAYBOOK.md** (copies in this
   folder) — the binding global craft and landing-page laws.

## Non-negotiable ground rules

- **No purple, ever** (any hue ~250–310°) and **no framework-default palette
  hexes** — accents are exactly the custom-mixed values in DESIGN.md.
- **No emoji in product UI.** Icons are a single consistent SVG set.
- **No red/green casino ticker** — debts are linen numbers with a minus
  sign; `clay` speaks only for sync errors.
- **One accent (vault green), rationed** — it draws the Line and small
  marks; never fills a button or surface.
- **Privacy is architecture, not copy** — Plaid Balance/Investments/
  Liabilities scopes ONLY (never Transactions); access tokens
  AES-256-GCM encrypted before rest; delete-my-data cascades.
- **Append-only money history** — balances and closes are never
  rewritten; corrections happen in the next close.
- **The paywall is honest** — free caps stated with the Plaid-cost
  sentence; entitlements enforced server-side, mirrored from RevenueCat
  webhooks.
- **Fonts bundled as app assets** (expo-font), loaded before first
  paint; web landing self-hosts woff2.
- **Real content everywhere** — plausible demo accounts and closes in
  every screen and empty state; no lorem.
- **Webhooks (Plaid + RevenueCat) follow verify → idempotent persist →
  enqueue → ack.**
- **.env.example placeholders only** — descriptive values, never
  realistic-looking keys.

## Build order

1. `server/`: schema migrate, magic-link auth, link-token + exchange
   endpoints with encrypted item storage; worker booting.
2. App shell: expo-router tabs, vault theme tokens, bundled fonts,
   zustand + SQLite cache.
3. Plaid Link end to end in sandbox: link → accounts → balances → the
   Line drawing a real series (Skia).
4. Manual assets, the monthly close ritual, close history.
5. RevenueCat paywall + server-side cap enforcement + entitlement
   mirror.
6. Web landing **last**, to MARKETING_PLAYBOOK.md: name the enemy (the
   seven-tab spreadsheet), the phone-frame device drawing the Line,
   the privacy page as a feature, one CTA phrase repeated verbatim:
   **"Get NetNest free"**.

## Definition of done

- Every item in README.md's MVP feature list works end to end against
  Plaid sandbox.
- `npm run typecheck` green in both the app and `server/`;
  `npm run build` green in `server/`; the Expo app boots in Expo Go /
  dev client with zero console errors.
- The worker registers every job in ARCHITECTURE.md's table and
  survives a Redis reconnect.
- Every screen matches DESIGN.md, including empty, loading, and error
  states; reduced-motion renders the Line complete instantly.
- A stranger can clone, fill both `.env.example`s, and run app +
  server with only the README's setup section.
