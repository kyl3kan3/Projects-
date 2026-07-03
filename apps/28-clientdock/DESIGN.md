# ClientDock — Design Specification

## Design vision
A private members' club for client work. ClientDock's entire value is making a
three-person agency feel like a firm with a lobby — so the design is hospitality:
ivory stone, deep racing green, brass keys, and the quiet theater of a door
opening onto work already in order. Two audiences, one standard: the agency's
admin feels like the staff corridor of a great hotel; the client portal feels
like being handed the key to your suite.

## Brand identity

| Role | Color | Hex |
|---|---|---|
| Ivory stone | `#F4F1EA` |
| Club green | `#1E4D3B` |
| Brass | `#B99552` |
| Ledger ink | `#20241F` |
| Approved | Stamp green | `#3E8E5A` |
| Awaiting | Bell amber | `#D9A441` |
| Muted | `#8A877C` |

- **Display:** `Ogg` (fallback `Playfair Display`) — engraved-invitation elegance for portal headings; **UI:** `Söhne` (fallback `Inter`); client names set in the serif always — the guest's name in the register.
- **Logo:** a door with a dock-cleat handle forming a "D". Icon: the cleat-door on club green.
- **Voice:** concierge. Agency-side: "Acme's portal hasn't been updated in 6 days — freshness matters." Client-side: whatever the agency's voice is; our defaults are hotel-calm ("Your latest files are in.").
- **White-label law:** on Agency tier, every token above is replaceable and *no ClientDock trace remains* — the design system's greatest flex is vanishing gracefully.

## Art direction
- Hospitality materials: ivory surfaces with a faint stone grain, hairline brass rules between sections, deep green used like lacquered wood on headers and primary actions.
- The portal is composed like a lobby: a welcome band with the client's name in serif, then "what's new" as the front desk, then rooms (modules) as labeled doors in a row.
- Status language is hotel signage: small brass-framed chips — IN PROGRESS, AWAITING YOU, APPROVED — engraved small caps.

## The signature moment — "The Key"
The client's magic-link entry is staged as arrival. Clicking the emailed link:
a **brass key card slides into a slot** (2.5D, 500ms `ease-in-out-soft`, a soft
mechanical click), the slot's light blinks green, and the portal door — a full-
viewport ivory panel with the agency's monogram embossed — **swings open** (3D
perspective hinge, 700ms `ease-out-expo`, interior light spilling through the
opening gap first). Inside, the lobby composes itself: welcome band settles,
then each module door lights its signage chip in sequence (80ms stagger), and
the "since your last visit" items glide onto the front desk one by one. Total
sequence 1.6s, skippable by scroll, played in full only on first visit per
session. The agency's brand colors re-skin every element — the choreography is
ours, the house is theirs. Agencies will send prospects the link just to show
the door.

## Motion system
- **Approval round (client-side, the money interaction):** the deliverable preview sits on a viewing easel; **Approve** presses a brass stamp — the stamp descends (200ms, `ease-anticipate` lift-then-press), leaves an embossed APPROVED seal with a 1px ink-spread, and the audit line writes itself beneath (name, timestamp, in ledger mono). Request-changes instead opens a margin-note card with a pencil affordance.
- **File versions:** stacked as tabbed folders; a new version slides atop the stack with the older tab still peeking — history visible, never buried.
- **Timeline module:** phases as a brass progress rail; the current phase's marker glows softly; updates tick the "last updated" stamp with a small press (freshness as design).
- **Message threads:** email replies threading in render as letters slipped under the door (slide-in from the module edge, 240ms).
- **Agency dashboard:** portal cards show a freshness dial (green→amber over days-since-update) and a client-pulse sparkline (views this week) — the two anti-churn metrics as ambient instruments; stale portals gently raise their hand (2px lift, once per visit).

## Key screens
1. **Marketing hero:** The Key sequence on loop with a "your logo here" live-theming demo beside it — type an agency name, pick two colors, watch the door re-skin in real time; pricing framed as "per business, not per seat" with a seat-math comparison.
2. **Client portal (the artifact):** lobby layout — welcome band, front desk (needs-your-attention items with bell-amber chips), module doors (Timeline, Files, Approvals, Messages, Invoices); footer is either agency-branded or a whisper-small "via ClientDock" on Solo.
3. **Money screen — Agency dashboard:** the portfolio wall of portal cards with freshness dials and pulse sparklines; a "needs attention" queue up top (unanswered approvals, stale portals); one-click "post an update" composer that writes to any portal.
4. **Portal composer:** module toggles as door switches, template duplication ("copy the Meridian setup"), live client-view preview in a device frame — always one click from seeing what the guest sees.

## Component language
- Buttons: rectangular 6px radius; primary club green with ivory text; brass reserved for the stamp, keys, and rails. Press = lacquer press (subtle darken + 1px dip).
- Cards: ivory, hairline borders, engraved small-caps labels.
- Chips: brass-framed signage as specced.
- Empty state (client): an unlit module door: "Nothing here yet — your team will stock this room." Empty (agency): a key on a hook: "Cut a key: invite your first client."

## Reduced motion & fallback
The Key → static open-door frame with contents visible, 120ms fade-in. Stamp → seal appears with audit line. Door-light sequences → all lit. Freshness dials static with day counts in text. Full theming preserved (it's structural, not motion).
