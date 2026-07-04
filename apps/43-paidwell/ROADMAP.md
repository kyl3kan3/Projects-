# PaidWell Roadmap

## Phase 0 — Setup (Week 0, ~3–5 days)

- Next.js 15 + TypeScript + Tailwind v4 scaffolded; CI runs lint + typecheck on every push
- Neon Postgres (dev + prod branches) + Drizzle migrations working; Upstash Redis + BullMQ hello-world round-trips
- Worker boots from the same repo (`npm run worker`) and deploys as a separate service
- QuickBooks and Xero developer apps created (sandbox companies connected); Stripe account + Connect Standard configured in test mode
- Resend account + dev sending domain verified (SPF/DKIM); Sentry wired into app and worker
- `.env.example` complete; secrets only in platform envs

**Acceptance criteria:**
- [ ] A sandbox QuickBooks company OAuths and its open invoices appear in the dev database
- [ ] A delayed BullMQ job enqueued from the app executes in the worker

## Phase 1 — MVP (Weeks 1–8)

- **Weeks 1–2: Data spine.** Auth + firm model; QBO/Xero OAuth, backfill (open invoices + 12 months history), nightly + webhook sync; per-client days-to-pay stats; CSV import.
- **Weeks 3–4: Sequence engine.** Ladder templates + tone presets; scheduling as delayed jobs; paid-recheck before every send; stop-on-reply; approval mode; per-firm sender domain flow.
- **Week 5: Portal.** Signed-link portal, invoice PDFs, Stripe card/ACH payments on the firm's connected account, partial payments, payment write-back to accounting.
- **Week 6: Promises.** Promise logging (portal + reply parsing + manual), sequence pause/resume, broken-promise escalation, reliability scores.
- **Week 7: Dashboard + forecast.** Aging buckets, DSO trend, needs-attention feed, weekly cash-in forecast from due dates + promises + client behavior.
- **Week 8: Our billing + hardening.** Stripe plans, plan gating, audit log, webhook replay tolerance, load test with a 500-invoice firm.

**Acceptance criteria:**
- [ ] A new firm connects QuickBooks and sees its aging audit (real DSO, slowest payers) within 10 minutes, unassisted
- [ ] No message is ever sent for an invoice whose synced balance is zero (test proves the send-time re-check)
- [ ] A reply to any step pauses the run within one sync cycle and surfaces the thread
- [ ] End-to-end in sandbox: invoice goes overdue → step 2 email → client opens portal → pays by card → invoice settles, payment written back to QuickBooks, sequence completed, audit rows present
- [ ] A promise logged in the portal pauses the sequence; passing the date unpaid resumes it at the firmer step with promise-aware copy
- [ ] Approval mode queues every send; nothing leaves without a tap; "approve all" works
- [ ] Forecast for a seeded firm matches hand-computed expected receipts within rounding
- [ ] 3–5 design-partner firms live for 2+ weeks with zero wrong-recipient or paid-invoice nags

## Phase 2 — Launch (Weeks 9–14)

- QuickBooks App Store + Xero App Store listings submitted (start early; review is slow)
- Marketing site to MARKETING_PLAYBOOK.md: the device is the DSO number rolling down; free **aging-audit** lead magnet (connect read-only → one-page report)
- Template SEO library ("polite payment reminder email" cluster) with the product's actual ladder copy
- Onboarding polish: tone-preset picker, go-live checklist (sender domain verified before autopilot)
- Launch: bookkeeper/fractional-CFO outreach, agency communities, comparison pages (vs Chaser, vs QuickBooks reminders)

**Acceptance criteria:**
- [ ] Both marketplace listings submitted and responding to review feedback
- [ ] Self-serve funnel proven: 10 firms signed up, connected, and live with zero human help
- [ ] 20 paying firms; aggregate collected-through-PaidWell > 10× aggregate fees
- [ ] Aging-audit page converts visitors to connected read-only accounts at a measured rate (target ≥ 8%)
- [ ] Deliverability: bounce < 2%, complaint < 0.1% across all sending

## Phase 3 — Growth (Months 4–12)

- SMS step option (10DLC); physical final-notice letter via Lob (per-send fee)
- Practice mode polish: multi-firm console, roll-up forecast, white-label portal footer
- Client statements (one link, all open invoices); late-fee automation with jurisdiction presets
- Sequence analytics: which step actually lands payments, per-tone benchmarks; data-backed default ladders
- API + Zapier; referral program for bookkeepers (20% recurring)

**Acceptance criteria:**
- [ ] $15k MRR; logo churn < 2.5%/month trailing 3 months
- [ ] ≥ 15 Practice-tier operators managing 2+ firms each
- [ ] Published benchmark report ("what actually gets net-30 invoices paid") from anonymized aggregate data
- [ ] Step-level attribution shipped: firms can see which nudge landed each payment
- [ ] ≥ 30% of new trials from marketplaces + referrals combined
