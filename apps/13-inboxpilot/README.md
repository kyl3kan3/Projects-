# InboxPilot

**AI email drafting inside plain Gmail — replies in your voice, one click, no new email client.**

---

## The Problem

Professionals who live in email (recruiters, salespeople, founders, agency owners, execs) spend 2+ hours a day writing messages that are 80% predictable. The AI answers to this so far all demand too much:

- **Superhuman** ($30/mo) requires switching email clients entirely — a non-starter for most.
- **Gemini for Gmail** is generic: no personal voice, enterprise-tier pricing via Workspace add-ons, and drafts read like a press release.
- **Compose AI** and similar extensions autocomplete sentences but don't produce complete, send-ready replies grounded in the thread.

The gap: people want *their* reply — their tone, their sign-off, their typical phrasing — generated from the full thread context, inside the Gmail tab they already have open.

## Target User

- **Primary:** individual professionals sending 30–100 emails/day in Gmail — recruiters, SDRs/AEs at small companies, agency account managers, solo founders.
- **Secondary:** small teams (5–20 seats) standardizing outbound tone.
- **Not targeting:** Outlook users (Phase 3 at earliest), enterprises with DLP procurement cycles.

## Market & Profitability

- Chrome extensions with AI are among the **fastest paths to revenue** for small products: distribution is the Chrome Web Store + Gmail's enormous installed base, and purchase friction is one click.
- Realistic outcome: **$3k–$30k MRR**. Extension businesses are rarely huge, but they're fast to validate and cheap to run.
- Willingness to pay is anchored by Superhuman at $30/mo — a $8–$20/mo tool that delivers the headline feature (AI replies in your voice) without switching clients is an easy expense.
- Margin: LLM cost per active user ≈ $0.50–$2/mo at 100 drafts — 85–90% gross margins.

## Monetization

| Tier | Price | Limits |
|------|-------|--------|
| Free trial | 14 days | 30 drafts total |
| Basic | $8/mo | 100 drafts/mo, tone presets |
| Pro | $20/mo | Unlimited drafts, personal voice model (learns from your sent mail), follow-up reminders, snippet library |

## MVP Features

- [ ] Gmail content script: "Draft reply" button injected into the compose/reply toolbar
- [ ] Full-thread context extraction → send-ready reply draft streamed into the compose box
- [ ] Tone controls: shorter / friendlier / firmer / more formal, one-click rewrite
- [ ] Voice training (Pro): analyze 50–200 sent emails (with explicit consent) to build a personal style profile — greeting style, sentence length, sign-off, phrasing habits
- [ ] Snippet library with variables ({{first_name}}, {{company}})
- [ ] Follow-up reminders: "no reply in 3 days" nudges surfaced in Gmail
- [ ] Account/billing via companion web app (Google OAuth + Stripe)

## Differentiation

1. **Voice, not autocomplete.** The personal style profile makes drafts sound like the sender, not like an AI. This is the retention feature — it compounds and can't be copied by switching tools without retraining.
2. **Zero migration.** Works inside vanilla Gmail. The pitch is "Superhuman AI without leaving Gmail, at a third of the price."
3. **Complete replies from thread context**, not sentence completion.

## Go-to-Market

- Chrome Web Store SEO (category: Workspace/productivity; keywords "AI email writer", "Gmail AI reply") — the store is a discovery engine in itself.
- Short-form demo videos (TikTok/Reels/Shorts: "watch AI answer my inbox in my voice") — this product demos exceptionally well in 15 seconds.
- Communities: r/sales, r/recruiting, LinkedIn creators in sales-tools niche (affiliate codes).
- Free tier virality: drafts get a subtle "Drafted with InboxPilot" signature during trial (removable), seeding recipient curiosity.

## Competition

| Competitor | Price | Weakness we exploit |
|------------|-------|---------------------|
| Superhuman | $30/mo | Requires switching email clients |
| Gemini for Gmail | Workspace add-on | Generic voice, no personal style, admin-controlled |
| Compose AI | Free–$10/mo | Autocomplete, not full thread-aware replies |
| Grammarly | $12+/mo | Corrects your writing; doesn't write the reply |

## Key Risks

- **Gmail DOM fragility:** Google ships UI changes that break selectors. Mitigation: use the maintained InboxSDK abstraction + canary monitoring that alerts on injection failure rates.
- **Google policy/permissions review:** `gmail.readonly` scope for voice training triggers OAuth verification + possible security assessment. Mitigation: launch Basic tier with *on-page DOM context only* (no Gmail API scopes); gate voice training behind verified OAuth later.
- **Platform squeeze:** Google keeps improving native Gemini drafts. The counter is personal voice + cross-account portability + price.
- **Privacy trust:** sent-mail analysis must be transparent (explicit consent, style profile stored as derived features only, never raw email retention). This is both an ethical requirement and the marketing message.
