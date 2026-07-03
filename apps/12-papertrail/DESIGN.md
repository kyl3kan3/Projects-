# PaperTrail — Design Specification

## Design vision
Fine stationery with an engine inside. PaperTrail's users send documents that ask
strangers for thousands of dollars — the design's job is to make a solo freelancer
look like an established firm. Ivory paper, ink-navy typography, letterpress
details, and one governing metaphor everywhere: the *chain* — proposal, contract,
invoice as three sheets physically threaded together.

## Brand identity

| Role | Color | Hex |
|---|---|---|
| Paper | Ivory | `#F8F5EF` |
| Ink | Navy black | `#14213D` |
| Brand | Fountain blue | `#2D5BFF` |
| Signed | Wax green | `#2E7D5B` |
| Overdue | Vermilion | `#D64535` |
| Gold detail | `#B8963E` |
| Muted | `#7D7A70` |

- **Display:** `Freight Text` (fallback `Source Serif 4`) — contract-grade serif.
- **UI:** `Inter`. **Money:** `Freight` old-style figures in documents; tabular `Inter` in dashboards.
- **Logo:** "PaperTrail" with the two "a" counters connected by a thin thread line that continues underneath as an underline — the chain. Icon: three stacked sheet corners threaded once.
- **Voice:** professional warmth. "Contract signed. The deposit invoice is already in their inbox."

## Art direction
- Documents render as true paper: ivory sheets with 1px deckle-soft shadow, on a cool `#E9E7E1` desk background; page corners are real (no radius on documents; 12px radius on UI chrome only — the contrast separates "paper" from "machine").
- Letterpress micro-details: section labels in small caps with 0.5px emboss; the paid stamp and signature seals debossed.
- The chain visual: a 1.5px thread line literally connects document cards in every list/timeline view, stitched through small eyelets.

## The signature moment — "The Fold"
Marketing hero: a single sheet of paper in 3D (R3F, cloth-thin plane with
realistic paper shader — fiber texture, soft translucency at edges) titled
**Proposal**. On scroll, the client's acceptance arrives (a fountain-blue
checkmark inks itself top-right), and the sheet **folds itself in half like a
letter and unfolds as the Contract** — same continuous sheet, new letterhead
(600ms fold with soft paper-bend shadow, contents crossfade at the fold's apex).
A signature strokes across it in real handwriting motion; wax-green seal presses
in (with a tiny radial deboss); the sheet folds once more and unfolds as the
**Deposit Invoice**, a payment button already glowing on it. Copy beside:
"One thread from 'maybe' to 'paid.'" The fold is the product thesis rendered
literally. In-product: chain-stage transitions use a fast 2D corner-fold wipe.

## Motion system
- **Client accepts (real-time):** the proposal card's thread tightens (draws taut, 200ms) and tugs the next chain node into existence.
- **Signature capture:** the client's drawn signature replays at 1.5× as ink with slight bleed (canvas line with width jitter); the audit-trail line items print beneath one-by-one (60ms stagger) like a receipt.
- **Payment received:** the PAID stamp rotates in at -8° and presses (scale 1.2→1 with a deboss shadow pulse); the invoice total's ink dries from fountain-blue to navy.
- **Reminder sequence:** scheduled reminders shown as letters queued in a rack; a sent reminder slides out with a postmark spin.
- **Dashboard numbers:** odometer rolls; overdue total underlined in vermilion that draws only when > 0.

## Key screens
1. **Marketing hero:** The Fold, center stage on the desk surface; below, template gallery shot as a flat-lay of beautiful documents (this doubles as the SEO template pages' shared art direction).
2. **The Chain view (money screen):** a client engagement as a horizontal thread — Proposal → Contract → Deposit → Final invoice — each a paper card with its status seal; the thread's completed span is ink-solid, the future span is dotted.
3. **Document editor:** WYSIWYG page at true aspect, blocks snap with `spring-gentle`; right rail holds the chain settings (deposit %, reminder cadence) as marginalia.
4. **Income dashboard:** paper-toned cards — Paid / Outstanding / Overdue — with a year strip of month spines like a ledger shelf.

## Component language
- Buttons: rectangular 6px radius, fountain-blue fill; secondary = navy outline on ivory. Press = letterpress dip (1px down + shadow tighten).
- Document cards: sharp corners, seal chips (draft/sent/signed/paid) as wax dots.
- Empty state: a blank sheet with a threaded needle beside it: "Start the thread — send a proposal."
- Errors: never red text on paper; vermilion marginalia notes with a pointing manicule (☞).

## Reduced motion & fallback
Fold → three static sheets connected by the thread, crossfading. Signature replay → static signature with audit list. Stamps → appear without rotation. Thread draws → visible complete.
