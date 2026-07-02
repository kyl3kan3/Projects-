# ShotStash

**A privacy-first screenshot manager: every screenshot instantly OCR'd and text-searchable, 100% on your machine.**

---

## The Problem

Screenshots are where information goes to die. The average knowledge worker's Desktop/camera roll holds hundreds of them — error messages, receipts, slack exchanges, code snippets, whiteboards — and the only retrieval tool is scrolling thumbnails and squinting. The moment you need "that screenshot of the AWS error from three weeks ago," it's functionally gone.

macOS Spotlight OCR is shallow and Mac-only; Google Photos requires uploading your screen contents to Google (a non-starter for anything work-related); CleanShot X is a superb *capture* tool but is Mac-only and treats the library as an afterthought. Nobody owns "search everything you've ever seen on your screen" as a local, private, cross-platform utility.

## Target User

- **Primary:** developers, designers, support engineers, and PMs who screenshot constantly as working memory — and anyone under confidentiality constraints (client work, healthcare, legal) who can't use cloud OCR.
- **Secondary:** researchers/students capturing sources; the broad "shoebox of screenshots" consumer.
- **Not targeting:** enterprise MDM deployment (later), video capture (out of scope for MVP).

## Market & Profitability

- **Utilities is the highest-LTV app category** in subscription data (~$68.90/12-mo trial-user LTV on mobile; the desktop-utility analog is strong one-time conversion) — users pay for tools they touch daily.
- Comparable desktop utilities sustain real businesses: CleanShot X (~$29 one-time, Mac-only) is a category staple; Shottr, Raycast, and menu-bar utilities validate the "small, sharp, paid" desktop market.
- Realistic outcome: **$3k–$25k/mo** blended (one-time licenses + Pro subscriptions). One-time $29 × 200 licenses/mo = $5.8k/mo at even modest reach; the OCR-search hook demos virally well.
- Costs are almost nil: OCR runs locally; there's no server bill scaling with users. Margin ≈ payment fees.

## Monetization

| SKU | Price | What it unlocks |
|-----|-------|-----------------|
| Free trial | 14 days, full-featured | — |
| License | $29 one-time (per major version) | Capture, OCR search, tags, collections, 1 machine → 3 machines |
| Pro subscription | $4/mo or $36/yr | End-to-end-encrypted sync between machines, share links, early features |

Sold via Polar.sh or LemonSqueezy (merchant-of-record = sales tax handled). The one-time license is the trust signal in a subscription-fatigued market; Pro sync is the recurring layer for multi-device users.

## MVP Features

- [ ] Global-hotkey capture: region / window / full screen, with instant edit (arrow, box, blur, text)
- [ ] **Auto-OCR on every capture** (and bulk-import of existing screenshot folders) into a local FTS index
- [ ] Search-as-you-type across all screenshot text, with match highlighting on the image
- [ ] Library: tags, collections, favorites, date/app filters
- [ ] Menu-bar/tray quick-search (the "Spotlight for screenshots" gesture)
- [ ] Watch folders: index screenshots taken with the OS's native tools too
- [ ] 100% local by default — no account, no telemetry without opt-in
- [ ] License activation (offline-capable) via Polar/LemonSqueezy

## Differentiation

1. **Search is the hero.** Capture tools compete on annotation; ShotStash competes on *retrieval* — "find any pixel of text you've ever screenshotted." Bulk-importing years of existing screenshots delivers a wow moment in the first five minutes.
2. **Privacy as architecture, not policy:** OCR and index never leave the machine; sync (Pro) is end-to-end encrypted. This is the wedge against Google Photos and cloud OCR, and it unlocks users whose work forbids cloud tools.
3. **Cross-platform** (Windows + macOS + Linux via Tauri) where the incumbent (CleanShot X) is Mac-only — Windows is an open field.

## Go-to-Market

- Show-don't-tell demos: 20-second "search my screenshot history" clips for Twitter/X, Reddit (r/macapps, r/software, r/productivity), and Hacker News (Show HN) — this feature demos exceptionally well.
- Listings: Product Hunt, AlternativeTo (as CleanShot X / Google Photos alternative), Setapp application once mature.
- SEO: "search text in screenshots", "CleanShot X for Windows", "screenshot OCR" — high-intent, low-competition queries.
- Developer credibility: public changelog + local-first architecture writeups (the audience rewards this).

## Competition

| Competitor | Price | Weakness we exploit |
|------------|-------|---------------------|
| CleanShot X | $29+ (Mac only) | Capture-first, weak library/search, no Windows/Linux |
| Shottr | Free–$8 | Mac-only, no persistent searchable library |
| Google Photos | Free | Cloud upload of your screen contents; no capture tooling |
| Native OS tools | Free | No OCR search, no organization |

## Key Risks

- **OS API churn:** screen-capture permissions (macOS ScreenCaptureKit, Wayland portals on Linux) are moving targets; isolate per-platform capture behind a trait/interface from day one (see ARCHITECTURE.md).
- **OCR quality expectations:** Tesseract underperforms on stylized UI text; plan platform-native OCR (Apple Vision on macOS, Windows.Media.Ocr) with Tesseract as the Linux/fallback path.
- **One-time-price treadmill:** revenue requires continuous new-license flow; mitigations are the Pro subscription layer and paid major-version upgrades.
- **Index scale:** tens of thousands of screenshots must stay fast; SQLite FTS5 handles this, but thumbnail/storage hygiene needs care on decade-old screenshot hoards.
