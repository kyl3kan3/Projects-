# MenuLift Roadmap

## Phase 0 -- Setup (Week 0, ~2-3 days)

Repo, infra, and accounts so Phase 1 is pure product work.

**Acceptance criteria:**

- [ ] Next.js 15 + TypeScript + Tailwind v4 repo scaffolded; CI runs lint + typecheck on every push
- [ ] Neon Postgres provisioned (dev + prod branches); Drizzle configured; `db:generate` / `db:migrate` work against dev
- [ ] Cloudflare R2 bucket for dish photos; presigned upload round-trips locally
- [ ] Stripe account in test mode; per-location subscription products/prices created; webhook endpoint receiving test events via Stripe CLI
- [ ] Resend account + dev sending domain verified (SPF/DKIM)
- [ ] `.env.example` complete; secrets in Vercel envs, never in repo
- [ ] Sentry wired in

## Phase 1 -- MVP (Weeks 1-6)

Goal: a restaurant can build its menu, print one QR code, 86 a dish from a phone in two taps, and see it disappear from the live menu instantly.

- **Weeks 1-2: Menu spine.** Auth + restaurant/location model; menu/section/item CRUD with prices, dietary tags, photos (R2 presigned uploads); the public menu page at `/m/[slug]` -- fast, readable, no app install, designed to the DESIGN.md redline.
- **Week 3: 86 board.** Staff PIN access on a phone; the 86 board (every item, one tap to 86/restore with an optional "back at" note); live menu reflects state within seconds (revalidation); nightly auto-restore option.
- **Week 4: QR + theming.** Per-table/per-location QR generation (SVG/PDF sheets); menu theming within the design system (logo, one accent within the color law); price scheduling (happy hour windows).
- **Week 5: Photo enhancement.** Upload -> AI enhancement pass (relight, background clean-up, consistent crop) with side-by-side approve/reject; never auto-publish an AI-touched photo without approval.
- **Week 6: Billing + onboarding.** Stripe per-location subscriptions; trial; onboarding that imports a menu from a photographed print menu or CSV; landing page per MARKETING_PLAYBOOK.md.

**Acceptance criteria:**

- [ ] Menu edit -> live public page in under 5 seconds, no redeploy
- [ ] 86ing an item takes two taps from a locked phone and removes it from the live menu
- [ ] QR sheet PDF prints correctly at 300dpi table-tent size
- [ ] Photo enhancement requires explicit approval; original always kept
- [ ] Menu import from photo produces editable draft sections/items (not silently published)
- [ ] Lighthouse mobile score >= 90 on the public menu page

## Phase 2 -- v1 Launch (Weeks 7-10)

Goal: the analytics that justify the subscription after the QR novelty fades.

- **Week 7: POS CSV import.** Column-mapping wizard for Toast/Square/Clover sales exports; item-matching review screen (fuzzy match, manual override); import history.
- **Week 8: Menu engineering.** Contribution margin per item (menu price minus entered plate cost); popularity from sales mix; the stars/plowhorses/puzzles/dogs quadrant, rendered to the redline spec; per-item recommendations ("raise $1", "reposition", "kill").
- **Week 9: Weekly digest.** Resend email: top movers, 86 frequency (demand signal), quadrant changes; one insight per email, not a dashboard dump.
- **Week 10: Polish + launch.** Multi-menu support (dinner/brunch/drinks); allergen filters on the public page; App Store-free staff PWA install flow; Product Hunt / restaurant-owner community launch.

**Acceptance criteria:**

- [ ] A Toast CSV imports with >= 95% auto-matched items on a real menu
- [ ] Quadrant view matches hand-calculated margins on a 40-item test menu
- [ ] Digest email renders correctly in Gmail/Apple Mail and drives one clear action
- [ ] Two design-partner restaurants live with weekly active 86 usage

## Phase 3 -- Growth (Months 3-6)

- Multi-location roll-ups (same menu, per-location prices and 86 state)
- Supplier price tracking -> margin alerts ("brisket up 14%, these 3 items now under target margin")
- Table-side reorder QR (bill-building without full POS integration)
- Google Business Profile menu sync (structured data)
- Per-location manager roles + audit trail
- Annual pricing; franchise/group tier

**Acceptance criteria:**

- [ ] Margin alert fires within a day of a supplier price edit
- [ ] Google menu schema validates in Rich Results test
- [ ] Net revenue retention > 100% on the first 50 restaurants (location expansion)
