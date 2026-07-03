# AnswerDesk — Design Specification

## Vision
A calm concierge that is never performative. AnswerDesk's differentiator is honesty — a
bot that will say "I don't know" — so the design makes honesty feel premium, not
deficient: composed teal, citations set like footnotes in a well-edited book, and a chat
widget that is the most refined, least intrusive bubble on a phone.

## Mobile layout (390 × 844)
The widget is the product, and most end-users meet it on a phone.
- **Launcher:** a 56px circular button pinned bottom-right, above `safe-area-inset`,
  never overlapping a host site's own CTA.
- **Open = bottom sheet, not full takeover:** the panel rises to ~85vh, rounded top,
  with a grab handle; the host page stays visible behind a light scrim. Zero layout
  shift on the host — the launcher and sheet are fixed, position-composited.
- **Chat column:** messages 16px, generous line-height; the composer is a sticky bar at
  the bottom (thumb zone) with a 44px send button; input font ≥16px to defeat iOS zoom.
- **Citations** render as inline superscript chips `[1]`; tapping opens a source card
  as a nested sheet (title, favicon, quoted lines) — reachable without stretching.
- **Handoff card** (collect email / "get a human") appears inline as a linen capsule
  with a single 48px action.
- The merchant dashboard is a separate responsive app: bottom tab bar (Bots · Deflection
  · Gaps · Settings), single-column cards.

## Identity
| Role | Name | Hex |
|---|---|---|
| Deep sea | Base | `#0B2530` |
| Panel | Panel | `#123240` |
| Brand | Concierge teal | `#2DD4BF` |
| Citation | Reference blue | `#60A5FA` |
| Honest unknown | Linen | `#E8E3D8` |
| Handoff | Human amber | `#F5B15C` |

Text `#EAF4F2`, muted `#7FA39E`.

- **Display (marketing):** `Reckless` (fallback `Source Serif 4`) — editorial trust.
  **UI & chat:** `Inter` 16px/1.6, proper quotes, no orphan words. **Data:** tabular
  Inter for the dashboards.
- **Signature detail — the honest status dot:** a small 8px dot beside the bot name
  carries its state as a quiet material change, not a face. Listening: calm teal, soft
  breathing. Thinking: teal with a single traveling shimmer (retrieval in progress).
  Uncertain — the crucial one: it drains to matte linen and goes perfectly still as the
  bot says "I'm not certain — want a person?" Handoff: warms to amber. Uncertainty as
  composure, in a dot that costs nothing on mobile. CSS/Framer only; 60fps.

## Responsive
Sheet → docked panel: at `md` the widget can open as a 400px anchored panel instead of a
sheet. The dashboard goes multi-pane (conversation list + transcript) at `lg`. **Optional
desktop enhancement:** the marketing hero runs a live self-answering demo scripted to hit
one uncertain-state — the honesty moment — with the status dot annotated in the margin.
Lazy, desktop-only; mobile gets a static three-frame version.

## Motion & touch
- Answer text streams in sense-groups (120–260ms); a citation chip pops after its
  sentence completes (`dur-micro`, 1.2→1). Source card rises 8px with `spring-gentle`.
- Sheet open/close uses `spring-gentle`; drag-down dismisses with a button equivalent (X).
- Targets ≥44px; composer send 44px. Haptic tick on send in native webviews.
- Deflection donut fills once; the handed-off segment is amber at equal visual weight —
  no red, no shame.

## Key screens
1. **Widget (mobile bottom sheet):** the refined chat — streaming answers, inline
   citations, inline handoff. The whole product in the thumb zone.
2. **Setup wizard:** URL in → crawl progress as a sitemap tree lighting node-by-node →
   inline "ask it something" test chat. Time-to-bot under 10 minutes is a KPI.
3. **Deflection analytics (money screen):** resolved / handed-off / unanswered, weekly
   trend, and the content-gap list ("write these 3 docs, deflect ~120 more"). Renews
   subscriptions.
4. **Conversation explorer:** transcripts with state changes (thinking / uncertain /
   handoff) marked in a margin timeline — support leads audit honesty itself.

## Component language
- Buttons: 10px radius, teal fill / deep-sea text; handoff actions amber-outlined.
- Bubbles: bot = panel glass, 14px radius, status dot left; user = merchant accent,
  right; system notes = centered linen capsules.
- Empty state: the status dot asleep (slow breathing): "Index a site and wake it up."

## Reduced-motion & fallback
Status dot → instant color/matte swap, 80ms fade, no breathing or shimmer. Sheet →
plain scale-fade. Streaming → paragraph-level fades. All states announced in text for
screen readers ("Checking the docs…", "Not fully certain."). Feature-complete, never
punitive.
