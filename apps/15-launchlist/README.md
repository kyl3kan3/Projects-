# LaunchList

**Waitlist + launch-page builder with viral referral mechanics — turn "coming soon" into a growth loop.**

---

## The Problem

Every product launch starts with the same 48 hours of yak-shaving: a landing page, an email capture form, somewhere to store signups, a referral mechanism if you're ambitious, and an email tool to actually talk to the list. Founders either burn launch momentum wiring Mailchimp to Carrd to a spreadsheet, or pay for four tools to serve one page.

The referral part matters most and is built least: waitlists that reward sharing ("refer 3 friends, move up 500 spots") consistently multiply signup rates — Robinhood's million-person waitlist made this famous — but building position tracking, unique links, fraud filtering, and reward tiers is a real project, so most launches skip it and leave growth on the table.

## Target User

- **Primary:** indie hackers and startup founders pre-launch (a new audience is born every day — this market never saturates and never churns for a bad reason: they either launched or didn't).
- **Secondary:** marketing teams launching new features/products at existing companies; newsletter creators gating early access.
- **Not targeting:** enterprise product marketing (procurement, SSO demands) at MVP.

## Market & Profitability

- Realistic outcome: **$3k–$25k MRR**. This is a classic micro-SaaS: small ACV, huge top-of-funnel, near-zero marginal cost.
- The structural churn (people launch and leave) is offset by the structural funnel: every hosted waitlist page is an ad for LaunchList in front of exactly the right audience (founders looking at other founders' launches).
- Competitors validate pricing: Prefinery charges $49–$419/mo; getwaitlist.com free tier feeds a $50/mo paid tier. There's room for a better-designed product at indie prices.

## Monetization

| Tier | Price | Limits |
|------|-------|--------|
| Free | $0 | 250 signups, 1 list, LaunchList badge |
| Growth | $19/mo | 5,000 signups, custom domain, remove badge, email blasts |
| Pro | $49/mo | Unlimited signups, A/B tests, API + webhooks, Zapier, priority support |

Free-tier badge on hosted pages is the acquisition engine — it must stay.

## MVP Features

- [ ] Page builder: templates (hero + form + social proof), theme controls, OG-image generation for link previews
- [ ] Hosted page (yourproduct.launchlist.app) + custom domain on Growth
- [ ] Embed widget (script tag / React snippet) for existing sites
- [ ] Referral engine: unique share links, position-in-line, "skip the line" mechanics, milestone rewards (e.g., 3 referrals = early access tier)
- [ ] Anti-fraud: disposable-email blocking, IP/device duplicate heuristics, manual review queue
- [ ] Signup dashboard: sources, referral leaderboard, conversion funnel
- [ ] Email blasts to the list (announcements, launch-day) with unsubscribe handling
- [ ] Export: CSV, webhook on signup, Zapier (Pro)

## Differentiation

1. **Referral mechanics as the default, not an add-on** — position, skip-the-line, and milestone rewards work out of the box in every template.
2. **Design quality:** launch pages are status symbols on founder Twitter/X; templates that screenshot beautifully get shared.
3. **Indie pricing** against Prefinery's $49+ entry, with a genuinely useful free tier.

## Go-to-Market

- The product is its own channel: free-tier badge + "Powered by LaunchList" on thousands of launch pages viewed by founders.
- Product Hunt (the audience literally lives there) + launch-adjacent communities (Indie Hackers, r/SideProject, WIP).
- SEO: "waitlist template", "product launch page", "Prefinery alternative" pages; free tools (waitlist ROI calculator, launch checklist).
- Twitter/X build-in-public: sharing real referral-curve data from launches using the platform.

## Competition

| Competitor | Price | Weakness we exploit |
|------------|-------|---------------------|
| getwaitlist.com | Free–$50/mo | Utilitarian design, weak page builder |
| Prefinery | $49–$419/mo | Priced for funded startups, dated UX |
| LaunchRock | Free–$5/mo | Effectively abandoned, ad-supported |
| Carrd + ConvertKit DIY | ~$28/mo combined | No referral engine, manual wiring |

## Key Risks

- **Naming collision:** "LaunchList" is used by existing products (launchlist.co and similar). Validate trademark availability and be ready to rename before public launch — the scaffold treats the name as a placeholder.
- **Structural churn:** users launch and cancel. Counters: multi-list accounts (serial builders), post-launch mode (convert waitlist to newsletter/changelog audience), annual plans discounted hard.
- **Email deliverability:** blasts from shared infrastructure risk spam-foldering; require domain verification (DKIM/SPF) for custom-domain senders and isolate sending pools by reputation.
- **Fraud/gaming:** referral rewards invite fake signups; heuristics + review queue at MVP, device fingerprinting only if abuse warrants (privacy trade-off).
