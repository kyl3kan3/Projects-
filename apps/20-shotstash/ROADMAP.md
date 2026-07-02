# ShotStash Roadmap

## Phase 0 — Setup (week 0)
- Tauri 2 app boots on macOS + Windows dev machines; SQLite + FTS5 migrations run
- Capture trait compiles with stub implementations per platform

**Done when:** dev build captures a region on at least one platform and stores the PNG.

## Phase 1 — MVP (weeks 1–6)
- Capture: region/window/full + annotation basics (arrow, box, blur, text)
- OCR pipeline: Apple Vision + Windows.Media.Ocr + Tesseract fallback; FTS5 indexing
- Library UI: search-as-you-type, in-image match highlighting, tags, collections
- Watch folders + bulk import with progress
- Menu-bar/tray quick search; global hotkeys config
- License activation (Polar.sh) + 14-day trial

**Done when:** importing 5,000 legacy screenshots yields sub-100ms searches, and a beta cohort of 20 uses search daily (retention signal, not just installs).

## Phase 2 — Launch (weeks 7–10)
- Polish: onboarding that triggers the bulk-import wow moment in minute one
- Signed/notarized builds for macOS + Windows; auto-update channel
- Marketing site + demo video; Show HN, Product Hunt, r/macapps + Windows communities
- AlternativeTo listings ("CleanShot X for Windows", "private Google Photos search")

**Done when:** 100 licenses sold; crash-free sessions >99.5%; refund rate <5%.

## Phase 3 — Growth (months 3–8)
- Pro tier: E2EE sync between machines + share links
- Linux build (Wayland portal capture); Setapp application
- Smart features (all local): auto-tag by app, duplicate detection, retention rules
- Paid major-version upgrade path planning (v2)

**Done when:** $3k/mo blended revenue; ≥15% of active licensed users on Pro; Windows ≥40% of sales (validating the cross-platform bet).
