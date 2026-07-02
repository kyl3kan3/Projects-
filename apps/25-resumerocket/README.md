# ResumeRocket

**An AI resume and cover-letter studio that tailors your application to each job posting — and shows you what the ATS robot sees.**

---

## The Problem

Every job application now passes through two readers: an ATS parser that filters by keywords, and a human who spends ~7 seconds on a first scan. Job seekers lose to both — generic resumes miss the posting's keywords, over-designed templates break ATS parsing entirely, and tailoring every application by hand takes 30–45 minutes nobody spends after the tenth application.

The demand is enormous and evergreen: resume-related queries are among the highest-volume career searches on the internet, and incumbents (Zety, Resume.io, Kickresume) built nine-figure-revenue businesses on template builders — mostly *before* AI could actually do the tailoring work. The AI layer that exists today is mostly "rewrite my bullet point"; the job-to-resume tailoring loop is still underserved.

## Target User

- **Primary:** active job seekers applying to 10–100 roles — mid-career professionals, recent grads, career switchers, laid-off tech workers. High urgency, short subscription lifetime, enormous volume of new entrants forever.
- **Secondary:** career coaches and university career centers (multi-seat, Phase 3).
- **Not targeting:** executive resume-writing services ($500+ human-written), CV formats for academia at MVP.

## Market & Profitability

- The category prints money on volume: Zety/Resume.io-class builders run at massive scale on $2.95-trial → $24/mo pricing (often with dark patterns — an explicit *anti-pattern* opportunity: honest pricing as differentiation in a category consumers actively distrust).
- Realistic outcome: **$10k–$80k MRR**, driven almost entirely by SEO volume; the risk profile is traffic acquisition, not willingness to pay.
- Short customer lifetime (people get hired!) is structural — the model must monetize fast: weekly/monthly passes over annual, alumni discounts for the next search.
- Costs: LLM per tailored resume ≈ $0.02–0.05; margins 90%+.

## Monetization

| Tier | Price | What it gets |
|------|-------|--------------|
| Free | $0 | 1 resume, 3 exports (watermarked), basic ATS check |
| Weekly Pass | $9.95/wk | Unlimited tailoring, exports, cover letters — matches the sprint nature of job hunting |
| Monthly | $19.95/mo | Same + application tracker, LinkedIn headline/summary rewrite |

Honest cancellation (one click, no retention maze) — stated loudly, because the category's dark reputation makes trust a feature.

## MVP Features

- [ ] Resume builder: clean ATS-safe templates (single-column bias), import from existing PDF/DOCX/LinkedIn export
- [ ] **Job-tailoring engine:** paste a job posting → keyword/skill gap analysis → rewritten bullets emphasizing matching experience (grounded in the user's real history — no fabrication, flagged suggestions only)
- [ ] ATS X-ray: show exactly what a parser extracts from your resume (parsed fields, missing keywords, format warnings)
- [ ] Cover-letter generator seeded by resume + posting, in three tones
- [ ] Match score per application with concrete fix list
- [ ] PDF/DOCX export with clean typography
- [ ] Application tracker lite (role, company, status, resume version used)

## Differentiation

1. **Tailor-to-posting as the core loop** — not a template gallery with an AI button bolted on. The unit of work is an *application*, not a document.
2. **The ATS X-ray** makes the invisible visible; it's the demo moment and the SEO magnet ("free ATS resume checker" is a huge query).
3. **No-fabrication guarantee:** the AI only reworks what the user actually did, and visibly flags every suggestion it isn't sure about. Trust is the moat in a category known for sleaze — including honest billing.

## Go-to-Market

- **SEO is the business:** free ATS checker tool + programmatic pages ("software engineer resume keywords", "resume for career change to UX", per-role template pages). The free checker converts scared applicants into tailoring subscribers.
- Reddit (r/resumes, r/jobs, r/cscareerquestions) — genuinely useful teardown participation; the ATS X-ray screenshot is native content there.
- TikTok career-advice creators (affiliates); layoff-wave responsiveness (tasteful, useful content when it matters).
- University career centers as a Phase-3 seat channel.

## Competition

| Competitor | Price | Weakness we exploit |
|------------|-------|---------------------|
| Zety / Resume.io | ~$2.95 trial → $24/mo | Dark-pattern billing reputation; template-first, weak tailoring |
| Kickresume | $19/mo | AI is generic rewriting, not posting-tailored |
| Teal | Free–$29/mo | Strong tracker, tailoring depth is the gap |
| Rezi | $29/mo | Closest on ATS focus; price + UX room |

## Key Risks

- **SEO dependence:** the channel is the moat and the risk; diversify with the free-tool flywheel and creator affiliates early.
- **LLM fabrication:** invented achievements would be catastrophic for users; grounding + suggestion-flagging is a hard product requirement, tested adversarially.
- **Short lifetimes:** structural; weekly passes, fast time-to-value, and alumni re-activation emails ("new search? 50% off") are the model.
- **Incumbent SEO muscle:** Zety-class players own head terms; win the long tail (role × situation pages) and the tool queries first.
