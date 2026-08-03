# ClauseCompass

**Contract review for freelancers and SMBs: upload a contract, get every clause extracted, risk-scored against a playbook, explained in plain English, and paired with suggested redline language — in minutes, not billable hours. Not legal advice, and it says so on every page.**

---

## The Problem

A freelancer gets a 14-page MSA at 6pm with "any concerns? hoping to kick off Monday." A lawyer would charge $300–800 to review it — often more than the first invoice on the project. So they skim, sign, and find out later what the IP-assignment clause, the uncapped indemnity, the 90-day payment terms, or the auto-renewal actually meant. Small agencies and SMBs do the same dance with vendor agreements, NDAs, and leases: the choice today is expensive counsel or an unread signature.

The market on both sides of that gap is large and moving fast:

- The US freelance workforce is projected to reach **86.5 million people — over half of the US workforce — by 2027** ([Upwork, Freelancing Stats](https://www.upwork.com/resources/freelancing-stats)); every engagement starts with a contract someone can't afford to have reviewed.
- **90% of small businesses report legal needs, but only ~20% can afford regular legal counsel** ([Business Research Insights, legal-tech AI market report](https://www.businessresearchinsights.com/market-reports/legal-tech-artificial-intelligence-market-109476)).
- The legal-AI software market was ~**$3.1B in 2025, projected to reach $10.8B by 2030 (28% CAGR)**, and contract drafting & review is its **fastest-growing segment at ~32% CAGR** ([MarketsandMarkets](https://www.marketsandmarkets.com/Market-Reports/legal-ai-software-market-88725278.html)).
- The well-funded tools in that wave (Ironclad, Spellbook, LegalOn, Luminance) are priced and sold to legal teams and law firms — enterprise CLM seats, sales demos, annual contracts. The person signing without reading is not their customer.

The gap: a self-serve, honestly-positioned "know what you're signing" tool at freelancer prices, opinionated about the 10 clauses that actually burn small service businesses.

## Target User

- **Primary:** freelancers, consultants, and studio owners (design, dev, marketing, writing, photo/video) reviewing client MSAs, SOWs, and NDAs they didn't draft — 1–20 contracts a year, each one existential to that engagement.
- **Secondary:** SMB owners/ops leads (5–50 employees) handling vendor agreements, SaaS terms, commercial leases, and contractor agreements without in-house counsel; bookkeepers/virtual COOs reviewing on clients' behalf.
- **Buyer moment:** a contract in the inbox and a deadline. Search-driven, urgent, willing to pay $19 tonight.
- **Not a target:** law firms, legal departments, enterprises with CLM — and anyone seeking actual legal advice; the product refuses that framing explicitly.

## Market & Profitability

- Urgency pricing works: the $19 pay-per-contract entry monetizes the panic moment with zero commitment, and every reviewed contract is a conversion path to $29/mo.
- Realistic outcome: **$15k–$90k MRR** in 2–4 years — a blend of subscriptions and per-contract purchases. At $40 blended ARPU that's 375–2,250 active customers; the SEO surface ("should I sign X clause") is enormous and weakly served for non-lawyers.
- COGS is Claude API tokens: roughly $0.15–0.60 per contract review at current pricing (a 15-page contract is ~15–25k input tokens through the extraction + analysis passes). At $19/contract that's a 97%+ gross margin on the wedge product; subscriptions similar at realistic usage.
- Churn risk is honest: contract review is episodic for freelancers. The pay-per-contract tier embraces that instead of fighting it, and the SMB tier (recurring vendor/client paper) carries retention.

## Monetization & Pricing

| Plan | Price | Limits & features |
|---|---|---|
| **Per contract** | $19 one-time | One full review: extraction, risk flags, plain-English explanations, suggested redlines, exportable report |
| **Freelancer** | $29/mo | 5 contracts/mo, saved playbook (your preferred terms), review history, negotiation email drafts |
| **Studio** | $79/mo | 25 contracts/mo, 3 seats, custom playbook rules, clause library across contracts, priority processing |

Overage on subscriptions at $9/contract. Annual at 2 months free. Every tier carries the same non-negotiable framing: **ClauseCompass is not a law firm and does not provide legal advice** — it's a reading tool that makes contracts legible and flags what a careful reader would question.

## MVP Feature List

- [ ] Upload: PDF and DOCX (and pasted text); text extraction with layout-aware handling of numbered sections, exhibits, and defined terms
- [ ] Clause extraction via the Claude API with **tool-schema-forced JSON**: every clause typed (payment terms, IP assignment, indemnity, non-compete, auto-renewal, termination, liability cap, confidentiality, warranties, governing law, late fees, revisions/scope), with exact source spans — every output anchored to quoted contract text, no unanchored claims
- [ ] Risk scoring against a playbook: default freelancer/SMB playbook (e.g. "payment > net-30 = flag," "IP assigns on payment, not on delivery," "indemnity must be mutual and capped," "auto-renewal window ≥ 30 days notice") producing OK / CAUTION / HIGH per clause with the rule that fired
- [ ] Plain-English explanations: what the clause means, what it means *for you*, and what "market" looks like for this clause — written to an 8th-grade reading level, no legalese
- [ ] Suggested redlines: replacement language per flagged clause, copy-paste ready, plus a generated "requested changes" email summarizing asks politely
- [ ] Missing-clause detection: what a contract of this type should contain but doesn't (no payment terms, no termination for convenience, no liability cap)
- [ ] The report: a shareable, exportable (PDF) review — clause map, flags, explanations, redlines — with the not-legal-advice banner on every page
- [ ] Custom playbook (Studio): adjust thresholds, add house rules ("we never accept non-competes")
- [ ] Billing (Stripe): subscriptions + one-time per-contract checkout with credits
- [ ] Disclaimer architecture: not-legal-advice acknowledgment at signup AND per report; no advice-shaped chat interface in v1 — the product reviews documents, it does not answer "what should I do?"

---

## Running it

Node 20+ and a Postgres database. Nothing else is required to see a real review:
without an Anthropic key, clause extraction runs on the built-in deterministic
analyser and every report is stamped `local-rules-v1` rather than a model id.

```bash
cp .env.example .env.local          # fill DATABASE_URL, AUTH_SECRET, SHARE_TOKEN_SECRET
npm install
npm run db:migrate                  # schema + the two invariant constraints
npm run db:seed                     # the built-in playbook and the eval fixtures
npm run dev                         # http://localhost:3046
```

Then: create an account (the not-legal-advice acknowledgment is required, and the
server enforces it), and buy a review. With no Stripe key configured you can set
`ALLOW_DEV_CREDITS=1` to get a clearly-labelled "simulate a $19 purchase" button on
the billing screen; it is ignored the moment a Stripe key exists. Upload a PDF or
DOCX, paste the text, or run the labelled demo contract.

| Command | What it does |
|---|---|
| `npm run dev` / `npm start` | The app on port 3046 |
| `npm test` | Unit tests: parsing, anchoring, the analyser, the scorer, the gates, the email, the Stripe decisions. No infrastructure needed |
| `npm run test:db` | Integration tests against `DATABASE_URL`: the schema invariants, the credits ledger, the whole pipeline, share links, the PDF |
| `npm run eval` | The quality gate: flag recall, fabricated-quote count, determinism over five runs, and the explanation gates, over the committed fixtures. Non-zero exit on a regression |
| `npm run db:migrate` | Apply migrations (`drizzle/`, including `0001_invariants.sql`) |
| `npm run typecheck` / `npm run lint` / `npm run build` | The usual |

**Background work.** A review runs one stage per request: the report screen advances
its own contract while you watch it, and `/api/cron/tick` (protected by `CRON_SECRET`,
refusing to run when it is unset) sweeps anything left mid-pipeline by a closed tab and
deletes contracts past their retention window. `vercel.json` schedules it daily.

**What ships without credentials.** Extraction and explanations fall back to the local
rules and the playbook's own templates; email is logged instead of sent; checkout is
unavailable and the billing screen says so. Every one of those states is visible in the
product rather than silently degraded.

Post-MVP (explicitly cut from v1): contract comparison/versioning, negotiation chat, template drafting, e-sign, clause benchmarking across corpus, team workflows/approvals, non-English contracts.

## Differentiation

1. **Playbook-scored, not chat-vibes.** Generic AI chat gives a different answer every upload. ClauseCompass scores against explicit, inspectable rules — the same contract always gets the same flags, and every flag names the rule and quotes the clause. Deterministic structure over vibes is the trust story.
2. **Anchored extraction.** Tool-schema-forced JSON with source spans means nothing in the report exists without a quote from the actual contract. The anti-hallucination architecture is a marketing feature, stated plainly.
3. **Built for the signing side.** Spellbook/LegalOn serve the drafting side (lawyers in Word). ClauseCompass serves the person the contract is pointed at — explanations assume no legal training, and redlines are written to be pasted into an email, not a brief.
4. **Honest positioning as the moat.** "Not legal advice" isn't fine print here; it's the brand's spine. That candor converts the exact anxiety competitors' overpromising creates — and it's the compliance posture that lets a non-law-firm operate confidently.
5. **Priced for the panic moment.** $19 tonight versus a $500 lawyer review or a $99+/seat/mo legal-team tool. Nobody credible owns this price point with real structure behind it.

## Go-to-Market

1. **SEO on the clause panic.** "should I sign a non-compete as a freelancer," "what does indemnification mean in a contract," "net 60 payment terms negotiate," "auto renewal clause cancel" — high-intent, high-volume, answered today by law-firm content that doesn't serve the signer. Each article ends in "paste your clause, see your flags."
2. **The free clause checker.** Paste one clause, get its type, flag, and plain-English read — the lead magnet is the product's first 30 seconds. Rate-limited, email-gated at the report.
3. **Freelance communities.** r/freelance, Indie Hackers, designer/dev Slacks and newsletters — contract horror stories are this audience's shared genre; the tool is the punchline that helps.
4. **Partnerships with freelancer platforms/tools.** Invoicing tools (the portfolio's own wedge audience), proposal software, and freelancer insurance brokers all meet the ICP at contract time; affiliate/integration deals.
5. **Templates plus review.** Free downloadable "freelancer-friendly" contract templates (marketing asset) with the pitch inverted: "receiving someone else's paper? Review it here."

## Competition

| Competitor | Price | Weakness we exploit |
|---|---|---|
| Human lawyer review | $300–800+ per contract | Cost and turnaround; overkill for a $3k engagement — we're the option before the lawyer, and we say when to hire one |
| Spellbook / LegalOn / Luminance | ~$100+/seat/mo, sales-led | Built for lawyers and legal teams in Word; not self-serve, not signer-side |
| Ironclad and CLM suites | Enterprise | Contract lifecycle for legal departments; irrelevant at our ACV, wins upmarket |
| ChatGPT / Claude directly | ~$20/mo | The real competitor. No structure, no consistency, no playbook, no anchored spans, no report artifact; the user must know what to ask. We productize the discipline they'd need |
| DoNotPay-style consumer legal | ~$36/yr | Credibility damage from overclaiming (FTC action over "AI lawyer" claims); consumer-dispute focus, no B2B contract depth |

## Key Risks

1. **Unauthorized-practice-of-law (UPL) exposure.** The line between "information about a document" and "legal advice" is real and state-by-state. Mitigation: no advice-shaped interactions (no "should I sign?" answers — the report describes and flags), persistent disclaimers with acknowledgment, "when to hire a lawyer" guidance built into HIGH flags, and a legal review of product copy before launch. DoNotPay's FTC settlement is the cautionary tale: never market as a lawyer replacement.
2. **Model errors on high-stakes documents.** A missed indemnity clause is worse than no review. Mitigation: anchored spans (unverifiable output is dropped), a coverage checklist per contract type (the model must account for every numbered section, flagging unparsed ones as "not analyzed"), confidence surfacing, and an eval suite of real contracts with known-answer flags run on every prompt/model change.
3. **Foundation-model platform shifts.** Anthropic pricing/behavior changes hit COGS and quality. Mitigation: pinned model versions with eval-gated upgrades; prompts and schemas are the IP, kept provider-portable.
4. **Frontier-lab and incumbent squeeze.** "Upload a PDF and ask" keeps getting better for free. Mitigation: the playbook layer, determinism, report artifact, and clause-type depth are product surface generic chat won't build; stay signer-side where legal-tech incumbents won't go down-market.
5. **Episodic usage economics.** Freelancers review contracts in bursts. Mitigation: pay-per-contract embraces it; the subscription earns its keep with the saved playbook and history; watch the blend honestly rather than forcing subscriptions.
6. **Trust cold-start.** Nobody hands their MSA to an unknown tool. Mitigation: the free clause checker (low stakes first), SOC 2-lite security posture stated plainly (encryption, retention windows, no training on customer contracts — contractually promised), and named-founder credibility content.
