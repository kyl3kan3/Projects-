# RoomGenius Roadmap

## Phase 0 — Setup (week 0)
- Next.js + Postgres + Redis running; Replicate render round trip works
- Conditioning experiment: pick the depth/edge pipeline that best preserves structure on 20 test rooms

**Done when:** a test room restyles in 3 styles with walls/windows intact.

## Phase 1 — MVP (weeks 1–5)
- Upload funnel → style grid results with before/after slider
- 20 styles tuned per room type; QA/bad-render detection + auto-retry
- Credit packs (Stripe) + free tier w/ watermark; HD upscale
- Share cards with referral links

**Done when:** blind test — target users prefer our renders over RoomGPT's on the same photos ≥70% of the time; render p95 <60s.

## Phase 2 — Launch + shop-the-look (weeks 6–10)
- Affiliate network approvals (start week 1 — they're slow); feed ingester + pgvector index
- Furniture detection → hotspots → product tray v1 (2 categories: sofas, accent chairs, then expand)
- Launch: Pinterest/TikTok creator seeding, Product Hunt, style-page SEO seeds

**Done when:** 500 pack purchases; ≥20% of paid renders get a product outclick; affiliate revenue > $0 proving the loop.

## Phase 3 — Growth (months 3–8)
- Pro staging tier: batch, empty-room mode, MLS disclosure labeling, priority queue
- More product categories + price-band controls ("this look under $2,000")
- Paint-color extraction (match to Sherwin-Williams/Behr codes — affiliate + shareable)
- iOS app if web economics prove out (packs avoid IAP tax via web billing where policy allows)

**Done when:** $8k/mo blended; Pro ≥30% of revenue (the stability floor); affiliate ≥10% and growing.
