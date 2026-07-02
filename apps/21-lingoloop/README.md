# LingoLoop

**An AI conversation tutor that gets you *speaking* a language — real voice conversations, gentle corrections, and a learning loop that adapts to your mistakes.**

---

## The Problem

Duolingo taught the world vocabulary; it did not teach the world to talk. The single biggest complaint from language learners — and the reason they plateau and churn — is that apps drill recognition while the actual goal is *conversation*. Human tutors solve this at $15–$60/hour (iTalki, Preply), which is unaffordable as a daily habit, and speaking to a human is precisely what anxious beginners avoid.

LLMs + modern speech models dissolved this constraint: infinitely patient conversation partners, at any level, on any topic, with instant correction — for pennies per session. The products that exist (Speak, TalkPal, Langua) validate the demand hard: Speak reached a $1B valuation on AI speaking practice alone.

## Target User

- **Primary:** adult learners (25–45) with a concrete motivation — a move, a partner's family, travel, work — practicing 10–20 minutes daily. They've done Duolingo, they can read a menu, they freeze when spoken to.
- **Secondary:** intermediate learners maintaining a language; heritage speakers rebuilding fluency.
- **Not targeting (MVP):** kids (COPPA burden), classroom/B2B licensing, test-prep (IELTS/TOEFL grading is its own product).

## Market & Profitability

- **Education is consistently a top-grossing subscription app category**, and language learning is its biggest slice. Duolingo's ~$750M+/yr proves the spend; Speak/TalkPal prove the AI-conversation wedge specifically.
- Subscription benchmarks: education apps convert well on **annual plans with trials**; blended realistic outcome for a well-executed indie entry: **$10k–$100k MRR**. The category is huge enough that a 0.01% share is a real business.
- Unit economics: a 15-minute voice session costs roughly $0.05–$0.15 in STT + LLM + TTS. A daily-habit user costs $2–5/mo against a $12–15/mo effective price — 60–75% margins, improving as speech pricing falls.

## Monetization

| Tier | Price | Limits |
|------|-------|--------|
| Free | $0 | 1 short session/day (text or voice), 1 language |
| Premium | $14.99/mo | Unlimited sessions, all languages, corrections report, custom scenarios |
| Premium Annual | $79.99/yr (hero SKU, 7-day trial) | Same, ~55% discount drives annual mix |

RevenueCat paywall; annual-with-trial as the anchor (education norm), monthly as the fallback.

## MVP Features

- [ ] Voice conversations: streaming STT → LLM tutor → TTS with natural interruption handling
- [ ] Level calibration onboarding (3-minute chat estimates CEFR level)
- [ ] Scenario library: order coffee, job interview, meet the in-laws, taxi, doctor — each with a goal to accomplish
- [ ] Gentle correction mode: tutor completes the conversation naturally, then a **post-session report** lists mistakes, better phrasings, and pronunciation flags
- [ ] Mistake memory: recurring errors become targeted warm-up drills (the adaptive loop)
- [ ] Text mode for quiet environments; tap-any-word translation
- [ ] Streaks + session history; 5 launch languages (ES, FR, DE, IT, PT)

## Differentiation

1. **The mistake loop.** Sessions feed a per-user error model; tomorrow's warm-up drills yesterday's mistakes. Competitors correct in the moment and forget; LingoLoop compounds.
2. **Goal-based scenarios** with completion states ("you successfully rebooked the flight") — game structure without gamification kitsch.
3. **Anxiety-first design:** slower speech toggle, "say it for me" lifeline, no public leaderboards. The target user is embarrassed, not competitive.

## Go-to-Market

- TikTok/Reels/Shorts: "I let an AI grill me in Spanish for 30 days" content — this category's demos are inherently viral and creators actively want this content.
- ASO: "speak Spanish", "Spanish conversation practice" — high-volume, clear-intent keywords.
- Reddit language-learning communities (r/languagelearning, per-language subs) — honest build-in-public posts perform well.
- Creator affiliates: language teachers on YouTube (they sell to exactly this user, and a tool referral is native content for them).

## Competition

| Competitor | Price | Weakness we exploit |
|------------|-------|---------------------|
| Duolingo (+ Max) | $7–$30/mo | Drills recognition, not speaking; Max's AI features are bolted on |
| Speak | ~$20/mo | Premium price; curriculum-heavy, weaker free-form conversation |
| TalkPal | ~$10/mo | Generic prompts, no mistake memory, thin scenario design |
| iTalki/Preply (human) | $15–60/hr | Cost + scheduling + social anxiety |

## Key Risks

- **Speech-stack quality bar:** laggy or robotic voice kills the illusion; budget real engineering for streaming latency (<1.5s response) and interruptions. Mitigation: text mode ships first internally, voice gates the launch.
- **Category giant response:** Duolingo Max bundles AI conversation. Counter: depth (mistake loop, scenarios) and price against Max's $30/mo.
- **Per-session cost creep:** heavy users could invert margins; cap "fair use" quietly (e.g., 90 min/day) and cache TTS for drill content.
- **Correction accuracy:** wrong corrections destroy trust; constrain the tutor to high-confidence corrections and label uncertain ones as suggestions.
