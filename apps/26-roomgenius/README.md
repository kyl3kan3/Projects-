# RoomGenius

**Photograph your room, see it redesigned in 20 styles in 60 seconds — then shop the look.**

---

## The Problem

Redecorating is a high-stakes purchase made blind: people spend hundreds to thousands of dollars on furniture and paint based on imagination and a Pinterest board. Interior designers solve it at $75–$200/hour, which prices out the mass market. The result is decision paralysis — the average person "plans" a room redesign for months.

Image models solved the visualization half: photo in, photorealistic restyled room out, structure preserved. Consumer demand is proven — AI interior apps (RoomGPT, Interior AI, ReimagineHome) rode viral cycles to meaningful revenue with what are essentially thin demos. The durable product — quality output *plus* "what do I buy to get this look" — is still open.

## Target User

- **Primary:** homeowners and renters (28–55, skews female, Pinterest/Instagram-native) actively planning a specific room refresh with a real budget.
- **Secondary:** real-estate agents and home stagers (virtual staging is a paid job today at $30–$100/photo — an obvious pro tier); Airbnb hosts.
- **Not targeting:** professional CAD/floor-plan design tools, architects.

## Market & Profitability

- Category demand is validated by the RoomGPT/Interior AI wave (fast rises to $50k+/mo at peak) — but also by their decay, which teaches the real lesson: **thin wrappers churn; the moats are output quality, workflow, and shop-the-look.**
- Realistic outcome: **$8k–$60k/mo blended**, spiky with viral cycles; the virtual-staging pro niche adds a stabler B2B floor (agents pay monthly, per-listing volume).
- Affiliate revenue on furniture is a genuine second stream: home-goods affiliate rates run 3–8% on high AOVs (Wayfair-class programs) — "shop the look" monetizes the 95% who never subscribe.
- Unit economics: an image generation costs $0.01–0.05; a credit pack sells 40 renders for $12–19. Margins 80–90%.

## Monetization

| Offer | Price | What it gets |
|-------|-------|--------------|
| Free | $0 | 3 renders (watermarked), 5 styles |
| Credit packs | $12 / 40 renders, $19 / 100 | All styles, HD, no watermark |
| Pro (staging) | $29/mo | 300 renders, batch upload, MLS-compliant "virtually staged" labeling, priority queue |
| Shop-the-look | — | Affiliate commissions on matched furniture (3–8% of high-AOV carts) |

Consumer buys packs (subscription fatigue is real here); pros subscribe.

## MVP Features

- [ ] Photo upload → structure-preserving restyle (ControlNet-style conditioning keeps walls/windows/layout) across 20 named styles (Japandi, Modern Farmhouse, Mid-century…)
- [ ] Room-type awareness (bedroom/living/kitchen presets)
- [ ] Before/after slider + side-by-side grid of style variants
- [ ] HD upscale on paid renders; watermark on free
- [ ] **Shop the look v1:** detect major furniture items in the render → match visually similar in-stock products (affiliate feeds) → tappable hotspots
- [ ] Empty-room mode (virtual staging) for the pro tier
- [ ] Share cards (before/after) with referral link

## Differentiation

1. **Shop-the-look closes the loop** from inspiration to purchase — it's the reason to come back after the novelty, the second revenue stream, and the data moat (which looks convert to carts).
2. **Structure preservation quality** as an obsession: the #1 complaint about existing tools is melted walls and hallucinated windows; a tuned conditioning pipeline + automatic bad-render detection beats them on the thing users actually judge.
3. **The pro staging lane** (batch, MLS labeling, consistency) turns a toy into a work tool with monthly revenue.

## Go-to-Market

- Pinterest + Instagram + TikTok: before/after content is the native format of these platforms; the share card IS the ad. Creator seeding in home-decor niches.
- SEO: "virtual staging free", "AI interior design", style-specific pages ("Japandi living room ideas" with interactive demo).
- Real-estate channel: agent Facebook groups, brokerage newsletters, listing-photo service partnerships for the Pro tier.
- App-store presence later; web-first keeps iteration fast and avoids 30% platform tax on packs.

## Competition

| Competitor | Price | Weakness we exploit |
|------------|-------|---------------------|
| RoomGPT | Free/$~15 | Demo-thin, quality plateaued, no shopping loop |
| Interior AI | $29+/mo | Subscription-only, no product matching |
| ReimagineHome | Credits | Quality inconsistency, weak pro workflow |
| Human virtual stagers | $30–100/photo | Cost + turnaround (we're instant at 1/10th price) |

## Key Risks

- **Wrapper commoditization:** the generation call is replicable in a weekend; the moat must be quality pipeline + shop-the-look + pro workflow, shipped fast.
- **Viral-cycle revenue spikes:** plan finances around the trough, not the peak; the Pro tier is the stabilizer.
- **Affiliate-feed dependency:** product matching relies on merchant feeds/APIs (Wayfair, Amazon, Home Depot programs) with approval processes and ToS constraints — start applications early, abstract the feed layer.
- **MLS/disclosure rules:** virtually staged listing photos must be labeled in most markets; build the labeling in (it's also the pro feature).
