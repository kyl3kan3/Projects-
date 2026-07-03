# PaperTrail — Design Specification

## 1. Vision
PaperTrail makes a solo freelancer look like an established firm. It sends the
documents that ask strangers for thousands of dollars — proposal, contract,
invoice — as one linked chain where nothing is retyped. Fine-stationery calm:
ivory paper, ink-navy type, quiet letterpress detail, and a single honest thread
connecting the three sheets.

## 2. Mobile layout (390×844)
Freelancers create on a laptop but *check status, send, and get paid* on their
phone. Mobile owns the review-and-act flows.

- **Nav:** a **bottom tab bar** — Chain · Documents · Income · Settings (4 tabs).
  Compose-heavy editing is available but tuned for tablet/desktop; the phone leads
  with reviewing and sending.
- **Chain view (money screen):** a client engagement as a **vertical thread** on
  mobile — Proposal → Contract → Deposit → Final — each a paper card stitched to
  the next by a 1.5px thread line. Completed span is ink-solid, future span
  dotted. The next action ("Send contract", "Remind") is one filled fountain-blue
  button in the thumb zone.
- **Document card:** true-paper look (sharp corners, soft deckle shadow), a wax
  status seal chip (draft / sent / signed / paid), title in the serif, amount in
  old-style figures. Tap opens the full client-facing web view.
- **Send / sign / deposit settings:** bottom **sheets** with large fields;
  primary confirm pinned to the bottom.
- Body ≥16px; document amounts never smaller than 18px; rows ≥56px.

## 3. Identity
| Role | Name | Hex |
|---|---|---|
| Paper | Ivory | `#F8F5EF` |
| Ink | Navy black | `#14213D` |
| Brand | Fountain blue | `#2D5BFF` |
| Signed | Wax green | `#2E7D5B` |
| Overdue | Vermilion | `#D64535` |
| Muted | Stone | `#7D7A70` |

- **Display:** `Freight Text` (fallback `Source Serif 4`) — contract-grade serif,
  used in documents and headings. **UI:** `Inter`. **Money:** `Freight` old-style
  figures inside documents; tabular `Inter` in dashboards.
- **Logo:** "PaperTrail" with the two "a" counters joined by a thin thread that
  continues as an underline — the chain.
- **Signature detail — the thread completing.** When a client signs (live), the
  contract card's thread draws taut (200ms), a small wax-green seal presses in
  (scale 1.15→1, a faint deboss), and the next chain node — the deposit invoice —
  stitches into existence beneath it. 2D SVG stroke + transform, 60fps on any
  phone. That's the product thesis ("one thread from maybe to paid") rendered
  small, not as a folding-paper 3D set-piece.

## 4. Responsive
Mobile is the review/act surface; **desktop is the authoring surface.** On
tablet/desktop the Chain becomes horizontal and the document editor opens as a
true-aspect WYSIWYG page with the chain settings (deposit %, reminder cadence) as
right-rail marginalia. No 3D anywhere. **Optional desktop-only enhancement:** on
the marketing page, a single scroll-driven 2D corner-fold that morphs a proposal
into a contract — CSS scroll animation, static stacked-sheets fallback, never
shipped to the app.

## 5. Motion & touch
- Shared tokens: seals/stamps `spring-snappy`; card snaps `spring-gentle`; thread
  draws `dur-standard`.
- **Signature capture:** the client's drawn signature replays once as ink with a
  slight width jitter; the audit-trail lines print beneath one-by-one (60ms
  stagger).
- **Payment received:** the PAID stamp presses in (scale 1.2→1, deboss pulse), the
  invoice total's ink settles from fountain-blue to navy.
- **Dashboard:** totals roll (odometer); the overdue figure's vermilion underline
  draws only when it's greater than zero.
- **Touch:** ≥44px targets; swipe a document card for quick actions (Send /
  Duplicate / Void — all present as buttons in detail); pull-to-refresh on Chain
  and Income.

## 6. Key screens (mobile-first)
1. **Chain (money screen):** the vertical threaded engagement, next action pinned
   in the thumb zone.
2. **Document view:** the client-facing paper rendered true-aspect, seal chip,
   share/send in a bottom sheet.
3. **Income dashboard:** paper-toned Paid / Outstanding / Overdue cards, a
   scrollable year strip of month spines like a ledger shelf.
4. **Templates:** flat-lay gallery of documents (shared art direction with the SEO
   template pages), each one tap from being used.

## 7. Reduced-motion & fallback
Thread draw / signing sequence → the seal and next node appear instantly, no
stroke or press. Signature replay → static signature with the audit list shown.
Stamps appear without rotation. Odometer → value swap. Errors are always vermilion
marginalia with a pointing manicule (☞), never red body text on paper.
