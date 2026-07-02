# StepDocs Roadmap

## Phase 0 — Setup (week 0)
- Extension skeleton records click events + screenshots on a test app
- Next.js app + Postgres running; upload path works

**Done when:** a 5-step recording lands in the DB with cropped screenshots.

## Phase 1 — MVP (weeks 1–5)
- Capture engine hardened (SPAs, scroll positions, typed-input summarization)
- Auto step text + LLM polish; guide editor (reorder/merge/retake/blur/notes)
- Redaction assist (local OCR + PII heuristics)
- Share links + viewer with checklists; PDF/Markdown export
- Workspaces + Stripe per-seat billing; free tier (10 guides + badge)

**Done when:** 10 pilot teams produce real SOPs; median record→published <10 minutes; capture succeeds on the top-20 common web tools.

## Phase 2 — Launch (weeks 6–9)
- Embed widget (help centers, Notion); brand config
- Chrome Web Store + Product Hunt launch; "Scribe alternative" comparison page
- Template gallery (per-tool SOP templates) as SEO surface

**Done when:** 1,000 installs; ≥8% of guide viewers click the badge; free→paid ≥5% of active workspaces.

## Phase 3 — Growth (months 3–8)
- Team tier: spaces/permissions, view analytics, stale-guide alerts, SSO
- Auto-update assist: re-run a recording and diff steps against the old guide
- Desktop capture (Tauri companion) for non-browser tools
- Localization of generated step text (guides in the reader's language)

**Done when:** $8k MRR; seat expansion ≥115% net revenue retention; stale-guide alerts driving weekly active return visits.
