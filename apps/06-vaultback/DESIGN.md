# VaultBack — Design Specification

## Design vision
A bank vault for databases. Massive, machined, mechanical — the aesthetic of
precision-engineered steel: brushed metal, deep shadows, brass tumblers, the
*chunk* of a lock engaging. Everything communicates one promise: your data is
behind a door nothing gets through, and you can open it any time you like.
Industrial luxury; zero whimsy.

## Brand identity

| Role | Color | Hex |
|---|---|---|
| Vault dark | Gunmetal | `#0F1214` |
| Panel | Machined steel | `#191E22` |
| Steel light | `#3A444C` |
| Brand | Brass bolt | `#D9A441` |
| Verified | Seal green | `#4CC38A` |
| Danger | Torch red | `#E5534B` |
| Text | `#E9EDF0` / muted `#8A96A0` |

- **Display:** `Neue Haas Grotesk` (fallback `Archivo`) — engineering-drawing authority, medium and bold only.
- **Mono:** `IBM Plex Mono` for checksums, byte sizes, cron expressions — the artifacts of proof.
- **Logo:** a square-jawed "V" formed by two vault-door bolts meeting; wordmark VAULTBACK in spaced caps (+8% tracking).
- **Voice:** engineer's log. "02:00 UTC — dumped, encrypted, verified. 4.2 GB. Checksum matched."

## Art direction
- Surfaces read as machined metal: vertical brushed-texture gradient (2% amplitude) on panels, chamfered corners (2px 45° notch on card corners instead of full radius), bolt-head details at panel corners on marketing.
- Brass appears only on interactive/locking elements. Green appears only on *verified* states (a backup isn't green until its checksum passes — design enforces the product's honesty).
- Diagram language: schematic lines with 90° bends, like a blueprint of pipes from DB → encryption → vault.

## The signature moment — "The Door"
Marketing hero: a photoreal-adjacent **3D vault door** (R3F, PBR brushed-steel
material, single warm key light + cool rim) filling 55% of the viewport, ajar.
On scroll: the door swings shut (1.1s `ease-in-out-soft` with a final 60ms
deceleration *thunk* — 2px camera shake), the handwheel spins (720°,
`ease-out-expo`), and six bolts slide home radially with 45ms stagger, each with
a brass glint. A green seal stamp appears: "Nightly. Encrypted. Yours." Reverse
scroll re-opens it revealing a glowing database cylinder inside. In-product echo:
completing a backup runs a 24px 2D version of the bolt-slide on the backup row.

## Motion system
- **Backup run (live):** a schematic pipe from the DB glyph to the vault glyph; data flow rendered as brass dashes traveling the pipe (dash-offset animation); stages (dump → compress → encrypt → upload → verify) light up as stations along the pipe.
- **Checksum verify:** the checksum string scrambles (mono characters cycling, 300ms) then locks character-by-character left→right into the final hash, ending with the seal-green tick.
- **Restore drill:** runs as a "key test" — a brass key outline draws, turns 90° (`spring-snappy`), and the drill report card unfolds beneath with results.
- **Retention pruning:** expired snapshots compact — rows compress vertically to 0 with a soft hydraulic ease and the storage meter rebalances with `spring-gentle`.
- **Danger zone (delete):** hold-to-confirm where holding physically *unscrews* a bolt (rotation tied to hold progress, 900ms) — releasing early re-tightens it.

## Key screens
1. **Marketing hero:** The Door; beneath it, a schematic strip of the pipeline with the stations labeled in blueprint style; pricing as three vault sizes (Hobby/Startup/Business drawn as increasing door diameters).
2. **Vault dashboard:** per-database rows — DB engine glyph, last backup age (mono), size, verified seal, sparkline of backup sizes; the pipe animation runs live during backups.
3. **Money screen — Restore:** a point-in-time dial (brass rotary control, snaps to snapshot detents with haptic-feel ticks) selecting the moment to restore; right panel shows exactly what will happen in engineer's-log language; the confirm is the key-turn.

## Component language
- Buttons: chamfered rectangles; primary brass with gunmetal text; secondary steel-outline. Press = 1px sink + brief specular sweep.
- Cards: chamfered corners, hairline steel borders; verified rows carry the small embossed seal.
- Empty state: an open, empty vault interior, softly lit: "Nothing in the vault. Connect a database."
- Progress: station-lighting along pipes, never bars alone.

## Reduced motion & fallback
Door → poster (door closed, sealed). Pipes → static schematic with stage checkmarks appearing. Scramble effects → direct text swap. Camera shake removed entirely.
