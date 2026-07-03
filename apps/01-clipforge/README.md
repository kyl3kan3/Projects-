# ClipForge

**One long-form video or podcast in → a week of content out: short clips with captions, tweet threads, LinkedIn posts, and a newsletter draft.**

## The problem

Every podcaster and YouTuber knows the math: the episode took 10 hours to produce, and it dies within 48 hours of publishing unless it gets repurposed. Repurposing is real work — scrubbing a 90-minute recording for the 6 moments that stand alone, cutting them to vertical, burning in captions, then rewriting the same ideas as a thread, a LinkedIn post, and a newsletter section. Done manually that is 4–8 hours per episode. Done by a VA or agency it costs $300–$1,500/mo and still requires review passes.

The result: most creators publish the long-form asset and maybe one clip, leaving 80% of the distribution value of every episode on the table. Content-marketing teams have the same problem at higher stakes — a webinar or founder podcast that legal and brand already approved is the cheapest raw material they have, and it goes unused.

## Target user

1. **Podcasters and YouTubers with an existing cadence** (weekly/biweekly show, 1k–500k audience). They already feel the repurposing pain every week; the buying trigger is "I know I should be posting clips and I'm not."
2. **Content-marketing teams at B2B SaaS** (2–10 person marketing org) repurposing webinars, podcasts, and conference talks. Higher willingness to pay, need team seats and brand presets.
3. Secondary: **agencies/VAs** who do this work for clients and want to compress their own hours (Team plan, multiple workspaces).

Not the target: casual creators without a publishing cadence (they churn), and viral-clipping hustlers chasing TikTok trends (Opus Clip serves them; they churn too).

## Market & profitability

- AI content tools have **proven willingness to pay at $19–$99/mo** — this exact category (Opus Clip, Castmagic, Repurpose.io) validated the price band; Opus Clip publicly crossed tens of millions in ARR, Castmagic reported $1M+ ARR within its first year.
- Realistic expectation for a well-executed entrant: **$10k MRR within 12–18 months is achievable; $100k+ MRR is the upside case**, not the base case. This is a crowded, validated market — you win share, you don't create demand.
- Unit economics: COGS per upload (transcription + LLM + GPU-less ffmpeg rendering + storage/egress) lands around **$0.60–$1.50 per 60-min episode**. At $29/mo for 5 uploads that's ~75–85% gross margin; margins improve on Pro/Team because heavy users pay proportionally.
- Churn is the killer in creator tools (creators quit podcasts). Expect **6–10% monthly churn on Starter**; Team accounts churn far less. The strategic goal is migrating revenue mix toward teams.

## Monetization & pricing

Subscription, priced on uploads/month (the honest cost driver) with feature gates on brand and team features.

| Tier | Price | Uploads/mo | Key features |
|------|-------|------------|--------------|
| **Starter** | $29/mo | 5 | Clips + captions, tweet threads, LinkedIn posts, newsletter draft, 720p export, watermark-free |
| **Pro** | $59/mo | 15 | Everything in Starter + 1080p export, brand presets (fonts/colors/logo), custom caption styles, priority processing |
| **Team** | $99/mo | 40 | Everything in Pro + 3 seats ($15/extra seat), shared workspace, approval workflow, API access |

- Annual = 2 months free (paid upfront — meaningful for cash flow at this scale).
- Overage: $3/extra upload rather than hard-blocking (converts heavy Starter users into Pro).
- Free trial: 2 uploads, watermarked clips, no card. The output *is* the demo.

## MVP feature list

- [ ] Upload video/audio (drag-drop + URL import from YouTube/RSS), up to 3 hours
- [ ] Whisper transcription with speaker labels and word-level timestamps
- [ ] LLM clip selection: 5–10 candidate moments scored for hook strength, self-containment, and quotability
- [ ] Auto-cut vertical (9:16) and square (1:1) clips with ffmpeg, active-speaker crop v1 = center-crop with manual nudge
- [ ] Burned-in animated captions (3 style presets)
- [ ] Tweet thread generator (hook tweet + 5–8 tweets) grounded in transcript quotes
- [ ] LinkedIn post generator (2 variants: narrative + listicle)
- [ ] Newsletter section draft (300–500 words with pull quotes)
- [ ] Editable outputs: transcript-based clip trimming, text editing before export/copy
- [ ] Project dashboard with processing status (queued → transcribing → selecting → rendering)
- [ ] Stripe billing with the three tiers + usage metering on uploads
- [ ] Email notifications when processing completes (episodes take 5–15 min)

Explicitly **not** MVP: direct social publishing/scheduling, AI voice-over, dubbing, team approval flows, API.

## Differentiation

- **Full-stack repurposing, not just clips.** Opus Clip is clips-only; Castmagic is text-only; Repurpose.io is distribution plumbing (no AI creation). ClipForge is the only tool where one upload yields the clip *and* the thread *and* the newsletter — the actual weekly workflow, in one place.
- **Grounded copywriting.** Threads and posts are generated with mandatory transcript citations (real quotes, timestamps), which kills the "generic AI slop" objection that plagues this category.
- **Editable, not black-box.** Every output lands in an editor (transcript-based clip trimming, text editing) — positioning against Opus Clip's "take it or re-roll it" UX.
- **B2B-ready from day one**: brand presets and team workspaces target the content-marketing segment the consumer-focused incumbents underserve.

## Go-to-market channels

1. **Podcast host partnerships/integrations** — RSS import makes Transistor, Buzzsprout, Captivate integration directories a distribution channel; their customers are exactly the ICP.
2. **YouTube creator-economy educators** — sponsor/affiliate deals with podcast-growth channels (Pat Flynn's SPI, Podcast Marketing Academy, Colin & Samir adjacent). Affiliate at 30% first-year recurring.
3. **SEO on high-intent comparisons** — "Opus Clip alternative", "Castmagic vs", "how to turn podcast into tweet thread", "podcast show notes generator". Category has strong search volume and weak comparison content.
4. **Build-in-public + free tools** — a free "podcast quote card generator" and "YouTube chapter generator" as lead magnets; launch both on Product Hunt separately.
5. **Communities**: r/podcasting, Podcast Movement Slack/events, Indie Hackers, LinkedIn content-ops crowd for the team segment.
6. **Programmatic virality**: optional "Made with ClipForge" watermark on free-trial exports only.

## Competition

| Competitor | Price | Strength | Weakness ClipForge exploits |
|------------|-------|----------|------------------------------|
| **Opus Clip** | Free–$29+/mo | Best-in-class clip AI, huge brand, virality score | Clips only — no threads/posts/newsletter; consumer-grade, weak team features |
| **Castmagic** | $23–$99/mo | Strong text repurposing (show notes, posts) | No video clips at all; text-only misses the highest-value output |
| **Repurpose.io** | $25–$125/mo | Distribution automation to every platform | No AI creation — it moves files, doesn't make content; dated UX |
| **Descript** | $16–$50/user/mo | Full editor, text-based editing | A pro editing tool, not an automated pipeline; repurposing is manual work inside it |
| **Vizard / Klap / 2short** | $10–$30/mo | Cheap clip generators | Thin products, no text outputs, race-to-the-bottom pricing |

The strategic bet: nobody owns "one upload → complete weekly content kit." Incumbents each own one slice.

## Key risks

- **Category crowding & CAC inflation.** Dozens of clip tools exist; paid acquisition is already expensive. Mitigation: win on the multi-format wedge and SEO/partnerships rather than ads.
- **Opus Clip expands into text outputs** (or Castmagic into video). Likely eventually. Mitigation: speed to the team/B2B segment where switching costs (brand presets, workflows, seats) accumulate.
- **COGS spikes from abuse** — 3-hour uploads on Starter, re-render loops. Mitigation: upload-minutes metering internally, per-tier duration caps, render caching.
- **Model dependency**: clip-selection quality is the product. Whisper + Claude prompts need continuous eval; a regression is a churn event. Mitigation: golden-set eval suite in CI (see ARCHITECTURE.md).
- **Creator churn is structural.** Podfade is real. Mitigation: annual plans, team-segment mix, and win-back flows; model the business at 7% monthly churn, not 3%.
- **Platform/API shifts**: YouTube import ToS, X API pricing for future publishing features. Keep publishing out of MVP; export-first keeps ClipForge platform-independent.

---

## Running it locally (this is a working build, not a stub)

This folder is a working Next.js 15 app plus a BullMQ worker. The web tier
handles auth, uploads, billing and the dashboard; the worker runs the
transcribe → select → render pipeline.

### Prerequisites
- Node 20+
- Postgres (local or Neon), Redis (local or Upstash)
- `ffmpeg` and `ffprobe` on your PATH (`brew install ffmpeg` / `apt install ffmpeg`)
- `yt-dlp` on your PATH for YouTube import (`brew install yt-dlp` / `pipx install yt-dlp`) — only needed if you use URL import
- API keys: OpenAI (Whisper), Anthropic (Claude), Cloudflare R2, Stripe (optional for billing)

### Setup
```bash
cp .env.example .env          # fill in DATABASE_URL, REDIS_URL, AUTH_SECRET, R2_*, OPENAI_API_KEY, ANTHROPIC_API_KEY
npm install
npm run db:push               # create tables from the Drizzle schema (or: db:generate && db:migrate)
```

### Run (two processes)
```bash
npm run dev            # web app on http://localhost:3000
npm run worker         # pipeline worker (separate terminal)
```

Then: sign up → upload a video/podcast → watch the project page live-update as
it transcribes, selects clips, and renders. Clips download as MP4s; threads /
LinkedIn posts / newsletter appear under **Written assets** with source quotes.

### What's implemented (the full MVP)
- Email/password auth (scrypt + signed JWT cookie), route middleware, per-user trial workspace
- **Ingest:** direct-to-R2 presigned uploads (browser → storage, no server proxying) **and** working URL import — YouTube via `yt-dlp`, podcast RSS via direct enclosure fetch — downloaded to R2 then run through the same pipeline
- **Transcription:** ffmpeg audio extraction → Whisper word-level timestamps, with **automatic time-chunking** of long recordings (>24MB audio is split into 10-min segments, transcribed with per-chunk offsets, and merged)
- **Selection + copy:** Claude clip selection + grounded copy (JSON tool-schema, zod-validated) — tweet thread, 2 LinkedIn variants, newsletter, each with timestamped source citations
- **Render:** ffmpeg cuts **both 9:16 (vertical) and 1:1 (square)** variants per top clip, with burned-in animated ASS captions (3 style presets) + thumbnail → R2
- **Editable outputs:** transcript-based **clip trimming** (edit start/end → fast-lane re-render of every aspect), per-clip **caption restyle**, and inline **text editing** of every written asset (persisted; copy/download use your edits)
- Live dashboard + project polling; Stripe checkout / customer portal / webhooks; upload-quota enforcement with $3 metered overage; Resend "kit ready" email (no-ops with a log line when `RESEND_API_KEY` is unset)

### Deliberately out of MVP scope (see ROADMAP.md)
Per the product spec these are explicitly not part of v1: direct social publishing/scheduling,
AI voice-over/dubbing, team approval flows, and the public API. Speaker-diarized transcripts
are noted as a later enhancement — the Whisper API gives word timestamps but not reliable
speaker labels, so the build does not fake them; that needs a diarization pass (e.g. pyannote).
Active-speaker crop is also future work — the current cut is a center-crop.

### Verify the build
```bash
npm run typecheck && npm run build
```
