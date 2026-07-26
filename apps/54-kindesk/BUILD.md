# Build Brief — KinDesk

**Status:** SCAFFOLD — nothing is implemented yet. Docs and stubs only. You (the building agent) are expected to produce the complete, working MVP described in this folder.

This folder is fully self-contained. It can be extracted to a fresh repository
and built with no other context. Everything you need is here.

## Read first, in this order

1. **README.md** — what the product is, who pays for it, the exact MVP feature
   list (that list is your scope; nothing more, nothing less).
2. **ARCHITECTURE.md** — stack, data model, the E2E sync relay, and how the
   pieces talk. The manifests (`app.json` / `package.json`) are the source of
   truth for framework and dependencies — build on exactly that stack.
3. **DESIGN.md** — a redline spec, not inspiration: exact palette hexes for the
   "Evergreen desk" identity, type roles, spacing, component construction, the
   one signature detail (the digest assembling), and motion rules. Deviations
   are build failures.
4. **ROADMAP.md** — build Phase 1 (MVP) only, in its order; run the Week-1
   sync spike before anything else.
5. **DESIGN_LANGUAGE.md** and **MARKETING_PLAYBOOK.md** (copies in this
   folder) — the binding global craft and landing-page laws.

## Non-negotiable ground rules

- **No purple, ever** (any hue ~250–310°) and **no framework-default palette
  hexes** — accents are exactly the custom-mixed values in DESIGN.md.
- **No emoji in product UI.** Icons are the single SVG set (20×20, 1.75px).
- **No gradients/glows on interactive elements.** Primary button is ink fill
  with paper text (light) / off-white fill with pine text (dark).
- **One accent (persimmon), rationed to ≤10% of any screen.** `moss`/`brick`
  carry meaning only (done-settled / overdue-owing).
- **Mobile-first at 390px.** Native Expo app; 390×844 is the spec.
- **Fonts must actually load** (self-hosted Hanken Grotesk, Inter, JetBrains
  Mono via expo-font) — a silent system-font fallback is a failed build.
- **Real content everywhere** — seed checklists, plausible family demo data in
  every screenshotable state; no lorem, no placeholder bars.
- **Space before boxes; hairlines, not borders; 4px scale; three radii
  (12/16/24)** — per DESIGN_LANGUAGE.md.
- **The non-clinical line is a hard boundary:** meds are a reference list with
  refill reminders — no MAR, no dosing, no care instructions, ever.
- **The privacy promise is architectural:** the relay stores ciphertext only;
  E2E keys derive from the share code and never leave devices; no accounts, no
  analytics SDKs. Any plaintext family data server-side is a build failure.
- **Money is mono:** every dollar figure renders in JetBrains Mono, tabular.
- **.env.example placeholders only** — descriptive values; never real keys.

## Build order

1. Install the manifests' stack exactly; get an empty app booting.
2. **Week-1 sync spike per ROADMAP** — the go/no-go gate before any screen.
3. Design tokens + global styles from DESIGN.md — both modes, icon set, task
   row, expense row, the digest card shell and its assembly keyframes.
4. SQLite schema + repositories, then screens in ROADMAP order (Tasks → Money
   → Vault/Contacts/Log → Family & sync → Digest/Today → Onboarding/Paywall
   → Settings), wiring real flows end to end — no mocked handlers left behind.
5. Landing page **last**, to MARKETING_PLAYBOOK.md: name the enemy (the four
   group texts and the spreadsheet no sibling opens), show the digest
   assembling within 5 seconds, the one device ("one desk instead of four
   group texts"), honest receipts (never fabricated), one CTA phrase repeated
   verbatim.

## Definition of done

- Every item in README.md's MVP feature list works end to end.
- Typecheck, lint, and production build are green (`npm run typecheck &&
  npm run lint && npm run build:check`), with zero console errors.
- Every screen matches DESIGN.md at 390px in both modes, including empty,
  loading, and error states; reduced motion collapses the digest assembly.
- Two-device sync field test passes; relay-side storage verified ciphertext.
- Balances verified against hand-computed ledgers; the non-clinical and
  privacy boundaries hold everywhere in copy and code.
