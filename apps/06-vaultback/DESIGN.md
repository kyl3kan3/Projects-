# VaultBack — Design Specification

## Vision
Backup assurance for people who deliberately chose not to run servers. VaultBack looks
like precision-engineered steel — machined surfaces, deep shadows, brass on the parts
that lock — and communicates one promise: your data is safe *and verified*, and you can
open the vault any time. Industrial calm, zero whimsy.

## Mobile layout (390 × 844 — the primary spec)
This is insurance you check on, not operate — a phone glance to confirm last night ran
and the restore drill passed. The phone view answers "am I covered?" instantly.

- **Nav:** bottom tab bar — Vault · Restore · Drills · Settings — above the safe-area
  inset. Brass on the active item only.
- **Vault dashboard:** a single scrolling column of database rows. Each row: engine
  glyph, database name, **last backup age** (mono), size, a **verified seal** (green
  only once the checksum passes), and a sparkline of backup sizes. Health reads at a
  glance — green means proven, not merely attempted.
- **Primary action** in the thumb zone: a full-width **Connect a database** on the
  empty state; contextually **Run backup now** / **Restore** pinned bottom on a
  database detail.
- **Restore (money screen)** on a phone: a vertical list of point-in-time snapshots
  (timestamp, size, checksum), tap to select the moment, then a plain-language
  "here's exactly what will happen" panel, then a **key-turn confirm** in the thumb
  zone.
- **Key components at phone width:** database health row; snapshot list item;
  restore-drill report card (pass/fail, table counts, checksums); a live pipeline
  strip during a running backup (dump → compress → encrypt → upload → verify) as
  labeled stations, scrollable in its own track.

## Identity
| Role | Hex |
|---|---|
| Vault dark (gunmetal) | `#0F1214` |
| Panel (machined steel) | `#191E22` |
| Steel light | `#3A444C` |
| Brass bolt | `#D9A441` |
| Seal green (verified) | `#4CC38A` |
| Torch red (danger) | `#E5534B` |
| Text | `#E9EDF0` / muted `#8A96A0` |

- **Display:** `Neue Haas Grotesk` (fallback `Archivo`) — engineering-drawing
  authority; body ≥16px on mobile.
- **Data/mono:** `IBM Plex Mono` for checksums, byte sizes, cron expressions — the
  artifacts of proof.
- Corners are chamfered (2px 45° notch) rather than fully rounded; brass appears only
  on interactive/locking elements; **green appears only on verified states** — the
  design enforces the product's honesty (a backup isn't green until its checksum
  passes).
- **Signature detail — the checksum lock.** When a backup verifies, its checksum string
  scrambles (mono characters cycling, ~300ms) then locks in character-by-character
  left→right into the final hash, ending on the seal-green tick. Small, mono, textual —
  it reads as proof, runs at 60fps on a phone, and needs no 3D. The in-product backup
  row also does a 24px bolt-slide on completion.

## Responsive
The phone's single column of database rows becomes a denser table on desktop with the
live pipeline shown inline. Restore's snapshot list scales to a two-pane view
(snapshots + impact panel). **Optional desktop-only enhancement:** the marketing hero's
photoreal 3D vault door (R3F, PBR steel) may swing shut with a bolt-slide on scroll,
lazy-loaded behind a static poster of the sealed door; it never loads on mobile, where
the hero is the sealed-door poster plus a blueprint-style pipeline schematic. The
point-in-time "dial" is a desktop affordance; on phone it's a tap-to-select list.

## Motion & touch
- Shared tokens. Live backup: brass dashes travel a schematic pipe; stages light as
  stations. Retention pruning: expired rows compress vertically to 0 with a soft ease,
  storage meter rebalances (`spring-gentle`).
- Restore drill: a brass key outline draws and turns 90° (`spring-snappy`), then the
  report card unfolds beneath.
- **Touch:** targets ≥44px; the key-turn confirm and "Run backup" in the thumb zone.
- **Gestures:** swipe a database row for quick actions (also overflow menu). Destructive
  delete is **hold-to-confirm** — holding unscrews a bolt (rotation tied to progress,
  ~900ms); releasing early re-tightens. Native haptic on the mobile client for verify
  and key-turn; web silent.

## Key screens (mobile-first)
1. **Vault dashboard:** per-database health rows with verified seals and size
   sparklines.
2. **Restore:** snapshot list → impact panel → key-turn confirm.
3. **Drill report:** pass/fail with table counts and checksums — the evidence the
   compliance PDF is built from.
4. **Connect database:** one-screen connection-string flow with provider auto-detect
   and reachability/permission checks.

## Reduced-motion & fallback
Checksum scramble → direct text swap ending on the seal tick. Pipe/station animation →
static schematic with stage checkmarks. Vault door → sealed poster. Bolt-unscrew
confirm → a plain press-and-hold progress ring. Camera shake removed entirely. Every
state (verified, failed, pruned) is also plain text.
