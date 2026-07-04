# StudyReel

**StudyReel turns your actual course — lecture recordings, slides, PDFs — into structured notes, spaced-repetition decks, and practice exams where every answer cites the exact source passage. If it can't point to your material, it doesn't say it.**

---

## The Problem

1. **Students study from raw material, not from study material.** A semester is 40 hours of lecture audio, 600 slides, and three PDFs. The transformation into notes, flashcards, and practice questions is hours of clerical work per week — so most students either do it badly, buy someone else's generic deck, or skip straight to cramming.
2. **Generic AI study tools hallucinate, and students get burned in the worst possible way: on the exam.** ChatGPT-made flashcards confidently invent facts, mangle professor-specific terminology, and cover the textbook's version of a topic instead of the version that will be graded. One wrong memorized fact costs more than fifty right ones — students learn to distrust the whole category.
3. **Spaced repetition works and almost nobody sustains it.** The evidence for retrieval practice + spacing is about as solid as learning science gets, but building good cards is the tax nobody pays. Anki's power users are a priesthood; everyone else churns.
4. **Professional-exam candidates have the same problem with money attached.** NCLEX, bar, CPA, boards: thousands of pages of official prep material, $500-$3,000 prep courses, and a pass/fail event that gates a career. They need drilling grounded in *their* prep provider's material, not a chatbot's vibes.

The unlock is discipline, not model magic: ingest the student's own corpus, generate only from retrieved passages, and attach the citation to every card and answer. Grounding is the product.

## Target User

- **Primary:** university students (18-25) in content-heavy majors — pre-med/bio, nursing, law, psych, history — who record or download lectures and study from slides. Already pay for Quizlet Plus, Chegg, or note-sharing subscriptions.
- **Primary #2:** professional-exam candidates (22-40) with a dated exam (NCLEX, CPA, bar, Security+, boards) and an existing pile of prep PDFs. Higher willingness to pay, seasonal, ferociously outcome-driven.
- **Secondary:** grad students and career-switchers in certification programs.
- **Not a target (yet):** K-12 (COPPA/parental complexity), institutional/LMS licensing (a Phase 3+ sales motion, not a product decision now).

## Market & Profitability

- **Education apps have a fat-tail monetization structure that rewards exactly this positioning.** Category-wide, most education apps earn modestly — but the P90 earns nearly 8x the median revenue per install ($3.13 vs $0.40 at day 365; RevenueCat, State of Subscription Apps 2025). The winners are premium tools with real utility, not broad free apps. StudyReel is built to be a P90 app: high-stakes users, real workflow, annual plans.
- **Education also leads categories in annual-plan pricing** (highest median yearly price among categories in RevenueCat's benchmarks), which fits the academic-year purchase psychology — students buy the semester or the exam cycle, not a month.
- **The spend is proven at scale:** Quizlet (tens of millions of MAU, subscription-led), Anki's durability, Chegg's rise and AI-era fall — students pay for study leverage and switch fast when something is 10x. Professional-exam candidates already pay $500-$3,000 for prep courses; $49/yr is impulse-purchase territory against that anchor.
- **Realistic outcome: $10k-$100k MRR.** Seasonal (September/January/finals/exam windows), high-churn-by-design (courses end), offset by low CAC via campus-viral sharing and creator content. Unit economics: ingestion + generation inference is front-loaded per course (~$0.50-2.00), then grounded retrieval per session costs cents — 70-80% gross margins at steady state.

## Monetization & Pricing

Powered by RevenueCat (`react-native-purchases`) with a single `premium` entitlement, shared across mobile and the companion web via account link.

| Plan | Price | Notes |
|---|---|---|
| Free | $0 | 1 course, 2 lecture ingests/mo, 50-card deck cap, daily review always free |
| Monthly | $9.99/mo | The exam-cycle plan for professional candidates |
| Student Annual | $49/yr (hero SKU, 7-day trial, .edu-verified) | ~59% discount; matches the academic-year purchase psychology |
| Annual | $69.99/yr | Non-student annual |

**Premium unlocks:** unlimited courses and ingests, full deck sizes, practice-exam generation, exam-mode analytics (readiness by topic), audio-lecture ingestion beyond the free cap, and web companion access.

**Paywall placement:** at the 3rd lecture ingest, at the 51st card, and at first practice-exam generation. The free daily review loop is never gated — retention is the business, and the review habit is retention.

## MVP Feature List

- [ ] Course workspace: create a course, upload PDFs/slides (PPTX/PDF) and lecture audio; companion web uploader for laptop files
- [ ] Ingestion pipeline: transcription (diarized, chaptered), slide/PDF parsing, cross-source topic alignment into a course outline
- [ ] Structured notes per lecture: outline-form, professor-terminology-preserving, each bullet linked to its source span (timestamp or page)
- [ ] Deck generation: cloze + Q/A cards generated *only* from retrieved passages, each card carrying its citation; user approves/edits cards before they enter rotation
- [ ] Spaced-repetition review (FSRS scheduling): daily queue, swipe grading, streak; works offline once synced
- [ ] The citation tap: every card and answer flips to show its exact source passage (transcript segment with audio scrub, or highlighted PDF region)
- [ ] Practice exams: timed, mixed-format (MCQ + short answer), built from course coverage map; every answer key entry cites its passage; self-grade with rubric hints
- [ ] "Not in your material" honesty: questions the corpus can't support are never generated; the coverage map shows thin topics explicitly
- [ ] Readiness view: per-topic mastery from review + exam history
- [ ] Paywall + RevenueCat; .edu verification for Student Annual
- [ ] Companion web (read + upload + review): upload from laptop, review decks, take practice exams on a bigger screen

Post-MVP (explicitly cut from v1): live lecture recording with real-time notes, collaborative/shared course packs, LMS integrations, image-occlusion cards, iPad handwriting.

## Differentiation

1. **Grounding as a hard guarantee, not a marketing word.** Generation is retrieval-locked: no passage, no card. Every card, note bullet, and exam answer carries a tappable citation to the user's own material. Competitors bolt "AI" onto flashcards; none will show you *where the answer came from* on every single item. Burned-by-ChatGPT students are the wedge audience.
2. **The whole course, not a document.** Tools that summarize one PDF exist. Aligning a semester — audio + slides + readings — into one navigable, citable corpus with a coverage map is a pipeline moat, not a prompt.
3. **Exam answers that survive dispute.** When a practice answer feels wrong, the citation settles it in one tap — against the professor's own slide. That moment converts skeptics and is the shareable artifact ("it cited lecture 7, 34:12").
4. **FSRS scheduling under a consumer-grade UX.** Anki's effectiveness without Anki's priesthood; decks arrive pre-made and pre-cited, the daily loop is 5 minutes, and the streak is honest (review-based, not open-the-app-based).
5. **One product, two exam markets.** The same grounding pipeline serves a $49/yr sophomore and a $9.99/mo NCLEX candidate; the candidate market funds the brand's outcome credibility ("passed on the first try" stories name real exams).

## Go-to-Market

- **Campus-season ASO + launch cadence:** "study from lectures," "lecture notes app," "flashcards from PDF," "NCLEX flashcards." Ship major pushes 4-6 weeks before September and January; finals-week content spikes in between.
- **StudyTok/creator seeding:** the citation-tap demo (question -> answer -> the professor's actual slide) is a native 20-second video. Seed studytok/medtok/nursing-school creators with free premium; their audiences are the exact buyers.
- **The burned-by-AI wedge content:** "I checked every AI study tool's flashcards against the actual lecture" writes itself, ranks, and frames the category on our terms (receipts included).
- **Subreddit + Discord presence done respectfully:** r/premed, r/NCLEX, r/CPA, r/LawSchool, course-specific Discords — founder posts on grounding methodology and honest limitations, not link spam.
- **Referral loop:** share a deck's *citation preview* with classmates (read-only card fronts + sources); claiming it requires the app. Course-mates are the natural viral unit.
- **Professional-exam partnerships (Phase 3):** prep-content publishers whose PDFs students already own; a "works with your Kaplan/UWorld notes" story that respects copyright (user-owned material only).

## Competition

| Competitor | Pricing | Weaknesses |
|---|---|---|
| **Quizlet (+ Q-Chat/AI features)** | Free; ~$36/yr Plus | Massive brand, generic decks; AI features are un-grounded and hallucination-prone; no lecture-audio pipeline; shared decks are someone else's course. |
| **Anki (+ AnkiHub ecosystem)** | Free (iOS $24.99 one-time) | The retention gold standard and the ceiling on card quality. Brutal UX, no generation, no grounding; premade decks (AnKing) dominate med but not general courses. We adopt its science (FSRS) and remove its tax. |
| **Turbolearn / Mindgrasp-class AI note apps** | ~$8-15/mo | Validate demand for lecture-to-notes. Weak or absent citation discipline, no serious SRS engine, no exam mode; retention is shallow once novelty fades. |
| **NotebookLM** | Free (Google) | Real grounding credentials and citations; a research tool, not a study system — no SRS, no exams, no readiness, no mobile study loop. The free giant we must out-*study*, not out-chat. |
| **UWorld / Kaplan / prep incumbents** | $300-$3,000/course | Own professional-exam content and trust. Their tools are content-locked and un-personalized; we complement (drill *their* material the user owns) rather than compete on content. Also the acquirer shortlist. |

## Key Risks

1. **Grounding failures are brand-fatal.** One viral screenshot of a cited-but-wrong answer undoes the whole positioning. Mitigation: retrieval-locked generation, verification pass (answer must be entailed by the cited passage or the item is discarded), conservative refusal ("not in your material"), and a visible per-item report mechanism with same-day triage.
2. **NotebookLM or a platform giant adds SRS + exams.** Mitigation: speed, mobile-first study loop, exam-vertical depth (readiness analytics, exam-format templates), and the .edu-priced brand. Being the *study system* rather than the chat surface is the defensible frame.
3. **Copyright pressure.** Students upload professor slides and paid prep PDFs. Mitigation: private-by-default courses, no public deck marketplace for uploaded content, DMCA process, and marketing that never encourages sharing copyrighted material.
4. **Transcription/parsing quality on real-world inputs** (bad lecture audio, scanned PDFs). Mitigation: confidence surfacing per source, re-record/re-upload nudges, and the coverage map honestly marking low-confidence regions instead of papering over them.
5. **Seasonal churn is structural.** Courses end; subscriptions lapse in May. Mitigation: annual-plan mix, exam-candidate segment (year-round), summer MCAT/LSAT cycles, and win-back campaigns timed to term starts.
6. **Inference cost creep on audio-heavy users.** A 40-hour-lecture power user costs real money to ingest. Mitigation: per-tier ingest caps, batch/off-peak processing, and unit-cost dashboards from day one (see ROADMAP Phase 1 acceptance).

---

## Repository Layout

This folder is a **scaffold**: documentation plus typed stub files. It is not a runnable app; there is no `node_modules` and no business logic. The Expo app lives in `app/` + `src/lib/`, the ingestion/grounding backend in `src/server/`, and the companion web in `web/`. See `ARCHITECTURE.md` for system design and the stub headers for per-file TODOs.
