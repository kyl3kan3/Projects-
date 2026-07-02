# StepDocs

**Click "record", do the task once, get a polished step-by-step guide with annotated screenshots — documentation that writes itself.**

---

## The Problem

Every team runs on undocumented tribal knowledge: how to issue a refund in the admin panel, onboard a client in the CRM, run the monthly export. Writing an SOP manually — screenshot, crop, arrow, paste, describe, repeat × 15 steps — takes 30–60 minutes per process, so it doesn't happen, and the same colleague gets interrupted with the same "how do I…" question forever.

Scribe proved the fix and the market: record a workflow once, auto-generate the guide. It grew to millions of users and a unicorn-track valuation — while leaving the flanks open: its free tier watermarks and gates, its pricing jumps to $23–$29/seat/mo for basics like branding and PDF export, and teams that just want guides (not a "process intelligence platform") feel the bloat.

## Target User

- **Primary:** operations folks, customer-support leads, IT admins, and trainers at 5–200-person companies — the person whose job quietly includes "explain the tool to everyone."
- **Secondary:** agencies delivering client handover docs; customer-success teams making per-customer guides; solo SaaS founders writing help centers.
- **Not targeting:** regulated-enterprise document control (validation workflows, e-signatures) at MVP.

## Market & Profitability

- Scribe validated demand at massive scale; "Scribe alternative" is a standing search category with real volume — the classic fast-follow-at-honest-pricing play.
- Realistic outcome: **$8k–$50k MRR.** Per-seat B2B pricing with viral distribution: every shared guide advertises the tool to its readers (the Loom/Calendly loop).
- Costs are tiny (screenshot storage + light LLM for step descriptions); margins 90%+.
- Expansion revenue is natural: teams start with one recorder and grow seats as guides spread internally.

## Monetization

| Tier | Price | Limits |
|------|-------|--------|
| Free | $0 | 10 guides, web capture, share links (small badge) |
| Pro | $12/seat/mo | Unlimited guides, branding, PDF/Word export, blur tool, edit history |
| Team | $25/seat/mo | Spaces & permissions, analytics (views, stale-guide alerts), SSO, embed in help centers |

Undercut Scribe's paid tiers while matching the features teams actually use.

## MVP Features

- [ ] Chrome extension recorder: capture click/type/navigate events + a screenshot per step, auto-cropped around the interaction point with a highlight marker
- [ ] Auto-generated step text ("Click **Save invoice** in the top right") from element context, LLM-polished
- [ ] Guide editor: reorder/merge/delete steps, retake screenshots, add notes/warnings, redact with blur
- [ ] **Auto-redaction assist:** detect emails/names/numbers in screenshots and suggest blurs (trust feature Scribe gates)
- [ ] Share: public/unlisted link, workspace access, PDF/Markdown export
- [ ] Embed widget for help centers/Notion
- [ ] Guide viewer with step checklists (readers tick through)

## Differentiation

1. **Honest tiering:** branding, export, and blur in the $12 tier — exactly the features Scribe paywalls at $23+. The comparison page writes itself.
2. **Redaction-first:** auto-detected PII blurring makes guides safe to share by default — the objection-killer for ops teams.
3. **Guides that stay alive:** view analytics + stale-guide alerts ("this guide's UI changed?" flags from reader feedback) — the retention hook beyond capture.

## Go-to-Market

- The share-link loop is the primary channel: every guide footer is a tasteful "Made with StepDocs — document your process free."
- SEO: "Scribe alternative", "how to create an SOP", per-tool guide templates ("SOP template for HubSpot onboarding").
- Communities: r/sysadmin, r/msp, ops/CS communities (Support Driven), IT newsletters.
- Chrome Web Store listing optimization; Product Hunt launch.

## Competition

| Competitor | Price | Weakness we exploit |
|------------|-------|---------------------|
| Scribe | Free w/ watermark → $23–29/seat | Price jumps, platform bloat, gated basics |
| Tango | Free → $20+/seat | Pivoted toward guidance overlays/enterprise |
| Loom (video) | $12.50+/seat | Video ≠ scannable reference docs |
| Manual (Docs/Notion) | Free | 30–60 min per SOP; nobody does it |

## Key Risks

- **Incumbent gravity:** Scribe's brand owns the category; win the price-sensitive and privacy-sensitive segments first, not head-on enterprise.
- **Capture fidelity:** SPAs, canvas apps, and iframes are hostile to event capture; scope MVP to standard web apps and be honest about limits; desktop capture is Phase 3.
- **PII liability:** screenshots inherently capture sensitive data; auto-redaction, encrypted storage, and workspace-visibility defaults are requirements, not features.
- **Viral-loop dependence:** if share links stay internal, growth stalls; the embed + template-gallery SEO lanes hedge it.
