# ClauseCompass Roadmap

## Phase 0 — Setup (Week 0, ~3–5 days)

- Next.js 15 + TypeScript + Tailwind v4 scaffolded; CI runs lint + typecheck
- Neon Postgres + Drizzle migrations; Upstash Redis + BullMQ round-trip; worker deploys as its own service
- Cloudflare R2 bucket + presigned uploads working; Anthropic API key provisioned with a pinned model version
- Stripe products created (subscriptions + one-time); Resend domain verified; Sentry wired into app and worker
- The eval harness skeleton exists before the pipeline does: 10 real contract fixtures (anonymized) with hand-labeled expected clauses/flags committed as `eval_cases`
- `.env.example` complete; a legal-copy review of disclaimers scheduled (booked now, needed by Phase 2)

**Acceptance criteria:**
- [ ] A PDF uploads to R2 and its raw text round-trips through unpdf in a worker job
- [ ] A tool-schema-forced Claude call returns schema-valid JSON for a fixture clause (the architecture's core assumption, proven first)

## Phase 1 — MVP (Weeks 1–8)

- **Weeks 1–2: Parse + extract.** Structured parsing (PDF/DOCX/paste) with page/offset bookkeeping; the `record_clauses` tool schema + forced extraction; quote-anchoring validation (unanchored output discarded + one re-request); coverage checklist per contract type.
- **Week 3: Playbook scoring.** Default freelancer/SMB playbook as versioned rules; deterministic scorer; missing-clause detection; the flag model (ok/caution/high + fired_because).
- **Week 4: Explanations + redlines.** Constrained explanation pass (reading-level + banned-phrase checks), redline suggestions, the "requested changes" email draft.
- **Week 5: The report.** Report UI (clause map → quote → explanation → redline), coverage strip, PDF export with the banner on every page, share tokens.
- **Week 6: Billing + accounts.** Stripe subscriptions + $19 one-time with credits ledger; credit reserve/refund on pipeline failure; disclaimer acknowledgment at signup; retention windows + delete.
- **Week 7: Eval + hardening.** Eval suite green-gated in CI on every prompt/schema change; failure modes (scanned PDFs, 100-page uploads, non-contracts) handled with honest errors; rate limits.
- **Week 8: Free clause checker.** Single-clause variant, IP rate limits, email gate, upsell path.

**Acceptance criteria:**
- [ ] A 15-page fixture MSA uploads and returns a ready report in < 5 minutes with live progress states
- [ ] Every clause in every report has at least one source span whose quote string-matches the parsed text (validator proves it; unanchored output never renders)
- [ ] The same contract + same playbook version produces identical flags across 5 runs (determinism test)
- [ ] Eval suite: ≥ 90% of hand-labeled expected flags found across the 10 fixtures, zero fabricated clause quotes; suite runs in CI and blocks prompt/model changes that regress
- [ ] Coverage honesty: a fixture with an unparseable exhibit shows it as "not analyzed" in the report, never silently missing
- [ ] Explanations pass the reading-level check and contain zero banned advice phrases (automated scan over every generated report in tests)
- [ ] $19 checkout → credit → review → report retrievable after sign-in; failed pipeline auto-refunds the credit
- [ ] The not-legal-advice banner appears on every report page (screen + PDF) and signup requires acknowledgment
- [ ] 10 design partners (real contracts) reviewed; at least 3 report a specific clause they renegotiated because of the report

## Phase 2 — Launch (Weeks 9–14)

- Legal review of all product copy + disclaimers completed (UPL posture)
- Marketing site to MARKETING_PLAYBOOK.md (device: the strikethrough — the clause that got caught; 5-second demo: a real clause getting flagged and redlined)
- SEO cluster live: 15 clause-panic articles ("should I sign a non-compete," "what does indemnification mean") each ending in the free checker
- Security page: encryption, retention windows, "we don't train on your contracts" as a contractual promise
- Custom playbooks (Studio tier) + saved playbook (Freelancer tier)
- Launch: r/freelance, Indie Hackers, freelance newsletters, Product Hunt; comparison pages (vs asking ChatGPT, vs Spellbook, vs a lawyer — honest about when the answer is "a lawyer")

**Acceptance criteria:**
- [ ] Legal copy review completed and its changes shipped before public launch
- [ ] Self-serve funnel proven: 50 strangers complete paid reviews with zero human help
- [ ] 150 paid reviews cumulative; ≥ 25 active subscribers; free-checker → paid conversion measured (target ≥ 4%)
- [ ] SEO cluster indexed with ≥ 8k organic visits/mo and measured checker usage
- [ ] Token COGS per review measured and < 5% of per-contract price at current volume
- [ ] Zero UPL complaints; support macros exist for "can you tell me if I should sign?" (the answer redirects to the report + lawyer guidance)

## Phase 3 — Growth (Months 4–12)

- Contract comparison (v2 vs v1 of the same agreement — renegotiation support)
- Clause library across an account's contracts ("every indemnity clause you've accepted")
- Contract-type expansion: leases and employment offers (each with its own playbook + eval fixtures before launch)
- Prompt caching + batching to halve token COGS; eval-gated model upgrades
- Partnerships: proposal/invoicing tools, freelancer insurance; affiliate program
- Team features for Studio (shared playbook governance, reviewer notes)

**Acceptance criteria:**
- [ ] $15k MRR blended; subscription share of revenue ≥ 50%
- [ ] Eval suite grown to ≥ 50 fixtures across 5 contract types; every model/prompt upgrade shipped through it with results recorded
- [ ] Token COGS halved from Phase 2 baseline via caching/batching (measured)
- [ ] ≥ 2 distribution partnerships live and attributable (tracked signups)
- [ ] Comparison feature used in ≥ 20% of Studio accounts' reviews
- [ ] A published transparency note: known failure modes and accuracy stats from the eval suite (honesty as brand, receipts included)
