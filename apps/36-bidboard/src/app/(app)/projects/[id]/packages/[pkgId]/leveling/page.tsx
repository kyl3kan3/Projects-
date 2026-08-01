import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canWrite, requireUser } from "@/lib/auth";
import { ActionForm } from "@/components/ActionForm";
import { Pill } from "@/components/StatusPill";
import {
  IconArrowDownNarrow,
  IconDownload,
  IconScale,
  IconTrophyFlat,
} from "@/components/icons";
import { divisionLabel } from "@/lib/csi";
import { dueStamp, initials, money, moneyShort } from "@/lib/format";
import { lowStrip } from "@/lib/leveling";
import { adjustmentsFor, loadLevelingPage } from "@/lib/leveling-data";
import { awardPreflight } from "@/lib/award";
import { hasLevelingExports, PLANS } from "@/lib/plans";
import { LevelingGridView } from "./LevelingGridView";
import {
  addAdjustmentAction,
  awardPackageAction,
  mapLineAction,
  removeAdjustmentAction,
  unawardPackageAction,
  unmapLineAction,
} from "../../../../actions";

export const metadata: Metadata = { title: "Leveling" };

export default async function LevelingPage({
  params,
}: {
  params: Promise<{ id: string; pkgId: string }>;
}) {
  const { id, pkgId } = await params;
  const { company, user } = await requireUser();
  const page = await loadLevelingPage(company.id, pkgId, {
    userId: user.id,
    label: user.email,
  });
  if (!page || page.project.id !== id) notFound();

  const { grid, pkg, project } = page;
  const adjustments = await adjustmentsFor(company.id, pkgId);
  const writable = canWrite(user.role) && pkg.status !== "awarded";
  const canExport = hasLevelingExports(company.plan);

  // The preflight for whichever column is currently apparent low — that is the
  // award the estimator is most likely to make, and the flags should be on screen
  // before they press anything.
  const preflights = new Map(
    pkg.status === "awarded"
      ? []
      : await Promise.all(
          grid.columns.map(
            async (c) => [c.bid.id, await awardPreflight(company.id, pkgId, c.bid.id)] as const,
          ),
        ),
  );
  const lowPreflight = grid.apparentLow ? (preflights.get(grid.apparentLow.bidId) ?? null) : null;

  return (
    <main className="wrap-wide">
      <header className="gutter" style={{ paddingBlock: "var(--s5)" }}>
        <Link href={`/projects/${id}/packages/${pkgId}`} className="t-secondary">
          ← {pkg.tradeLabel}
        </Link>
        <p className="t-label" style={{ marginTop: "var(--s3)" }}>
          {pkg.csiDivision} · {divisionLabel(pkg.csiDivision)} · {project.name}
        </p>
        <h1 className="t-h2" style={{ marginTop: "var(--s1)" }}>
          <IconScale size={20} /> Leveling
        </h1>

        {grid.columns.length === 0 ? (
          <p className="t-secondary" style={{ marginTop: "var(--s4)" }}>
            No bids in yet. {dueStamp(project.bidDueAt).toLowerCase()}.{" "}
            {page.nonBidders.length > 0
              ? `${page.nonBidders.length} bidder${page.nonBidders.length === 1 ? "" : "s"} invited.`
              : "Nobody invited yet."}
          </p>
        ) : (
          <>
            <p
              className="t-label"
              style={{ marginTop: "var(--s4)", color: "var(--accent)", letterSpacing: "0.1em" }}
            >
              <IconArrowDownNarrow size={14} /> {lowStrip(grid)}
            </p>
            {grid.spreadCents !== null ? (
              <p className="t-secondary" style={{ marginTop: "var(--s2)" }}>
                {grid.columns.length} bids · spread {moneyShort(grid.spreadCents)} low to high ·
                totals adjusted, not raw
              </p>
            ) : null}
            {grid.apparentLowProvisional ? (
              <p className="notice notice-bad" style={{ marginTop: "var(--s3)" }}>
                No column covers the whole scope, so this low is provisional. Plug the gaps below
                and it becomes comparable.
              </p>
            ) : null}
          </>
        )}
      </header>

      {page.award ? (
        <section className="gutter" style={{ paddingBottom: "var(--s5)" }}>
          <div className="notice notice-ok">
            <p className="t-title">
              <IconTrophyFlat size={18} />{" "}
              {grid.columns.find((c) => c.bid.id === page.award!.bidId)?.bid.subName ??
                "A bidder"}{" "}
              awarded at {money(page.award.awardedTotalCents)}
            </p>
            {page.award.awardNote ? (
              <p style={{ marginTop: "var(--s2)" }}>{page.award.awardNote}</p>
            ) : null}
            <p className="t-label" style={{ marginTop: "var(--s2)" }}>
              {page.award.notificationsSentAt
                ? "AWARD AND REGRET NOTICES SENT"
                : "NOTICES NOT SENT"}
              {" · BIDS ARE READ-ONLY"}
            </p>
          </div>
          {canWrite(user.role) ? (
            <details style={{ marginTop: "var(--s4)" }}>
              <summary className="btn-quiet">The sub backed out — pull the award</summary>
              <div style={{ marginTop: "var(--s3)" }}>
                <ActionForm
                  action={unawardPackageAction}
                  submitLabel="Pull the award"
                  variant="danger"
                  confirm="Pull this award? The package reopens and the previous award stays in the record."
                  hiddenFields={{ packageId: pkgId }}
                >
                  <input
                    className="input"
                    name="reason"
                    required
                    maxLength={300}
                    placeholder="Sub withdrew — could not hold the price past April"
                  />
                </ActionForm>
              </div>
            </details>
          ) : null}
        </section>
      ) : null}

      {/* ---------------------------------------------------------- the grid --- */}
      {grid.columns.length > 0 ? (
        <LevelingGridView grid={grid} />
      ) : (
        <section className="gutter">
          <div className="card" style={{ padding: "var(--s6)" }}>
            <p className="t-label">THE GRID FILLS ITSELF</p>
            <p className="t-secondary" style={{ marginTop: "var(--s3)" }}>
              Rows are the bid form lines you already wrote. Columns appear as bids land — each one
              snaps into alignment, per-line lows light up, and the adjusted total at the foot is the
              number you take to the owner.
            </p>
            <Link
              href={`/projects/${id}/packages/${pkgId}`}
              className="btn btn-secondary"
              style={{ marginTop: "var(--s5)" }}
            >
              Invite bidders
            </Link>
          </div>
        </section>
      )}

      {/* ---------------------------------------------------- non-bidders --- */}
      {page.nonBidders.length > 0 ? (
        <section className="gutter" style={{ paddingTop: "var(--s5)" }}>
          <h2 className="t-label">Not in this comparison</h2>
          <ul className="stack" style={{ gap: "var(--s2)", marginTop: "var(--s3)", listStyle: "none" }}>
            {page.nonBidders.map((n) => (
              <li key={n.subName} className="t-secondary">
                {n.subName} —{" "}
                {n.reason === "declined"
                  ? "declined"
                  : n.reason === "no_response"
                    ? "no response by the due date"
                    : "still working on it"}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ------------------------------------------------ needs-mapping tray --- */}
      {grid.tray.length > 0 ? (
        <section className="gutter" style={{ paddingTop: "var(--s6)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h2 className="t-label">Needs mapping</h2>
            <Pill tone="amber">{grid.tray.length} ROW{grid.tray.length === 1 ? "" : "S"}</Pill>
          </div>
          <p className="t-secondary" style={{ marginTop: "var(--s2)" }}>
            Rows these subs wrote themselves. The money is already inside their total — mapping it
            onto one of your lines is what makes the comparison line up.
          </p>

          <div className="rows" style={{ marginTop: "var(--s4)" }}>
            {grid.tray.map((item) => {
              const suggestion = page.suggestions.get(item.bidLineId);
              return (
                <div
                  key={item.bidLineId}
                  className="stack"
                  style={{ gap: "var(--s3)", paddingBlock: "var(--s4)" }}
                >
                  <div className="stack" style={{ gap: 2 }}>
                    <span className="t-label">{item.subName}</span>
                    <span className="t-body" style={{ fontSize: 15 }}>
                      {item.rawDescription}
                    </span>
                    <span className="t-data" style={{ color: "var(--fg-2)" }}>
                      {item.amountCents === null ? "no amount" : money(item.amountCents)}
                    </span>
                    {suggestion ? (
                      <span className="t-secondary" style={{ color: "var(--accent)" }}>
                        Suggested: {suggestion.formLineDescription} (
                        {suggestion.reason === "remembered"
                          ? "you mapped this before"
                          : `${Math.round(suggestion.confidence * 100)}% match`}
                        )
                      </span>
                    ) : null}
                  </div>

                  {writable ? (
                    <ActionForm
                      action={mapLineAction}
                      submitLabel="Map it"
                      variant="secondary"
                      compact
                      hiddenFields={{ packageId: pkgId, bidLineId: item.bidLineId }}
                    >
                      <label className="field" style={{ flex: 1, minWidth: 220 }}>
                        <span className="t-label">Onto</span>
                        <select
                          className="select"
                          name="bidFormLineId"
                          required
                          defaultValue={suggestion?.bidFormLineId ?? ""}
                        >
                          <option value="" disabled>
                            Pick a form line…
                          </option>
                          {[...grid.rows, ...grid.alternateRows].map((r) => (
                            <option key={r.formLine.id} value={r.formLine.id}>
                              {r.formLine.description}
                              {r.formLine.isAlternate ? " (alt)" : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label
                        className="t-secondary"
                        style={{ display: "flex", gap: 6, alignItems: "center" }}
                      >
                        <input type="checkbox" name="remember" defaultChecked value="on" />
                        Remember for this sub
                      </label>
                    </ActionForm>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------ remembered mappings --- */}
      {page.remembered.length > 0 ? (
        <section className="gutter" style={{ paddingTop: "var(--s6)" }}>
          <h2 className="t-label">Mapped from memory</h2>
          <p className="t-secondary" style={{ marginTop: "var(--s2)" }}>
            These rows placed themselves using corrections you made on an earlier project. Nothing
            is hidden — put any of them back in the tray if the wording means something different
            this time.
          </p>
          <div className="rows" style={{ marginTop: "var(--s4)" }}>
            {page.remembered.map((r) => (
              <div key={r.bidLineId} className="row" style={{ alignItems: "flex-start" }}>
                <div className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                  <span className="t-label">{r.subName}</span>
                  <span className="t-secondary">
                    &ldquo;{r.rawDescription}&rdquo; → {r.formLineDescription}
                  </span>
                </div>
                {writable ? (
                  <ActionForm
                    action={unmapLineAction}
                    submitLabel="Undo"
                    variant="quiet"
                    compact
                    hiddenFields={{ packageId: pkgId, bidLineId: r.bidLineId }}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* --------------------------------------------------------- plug gaps --- */}
      {writable && grid.columns.some((c) => !c.complete) ? (
        <section className="gutter" style={{ paddingTop: "var(--s6)" }}>
          <h2 className="t-label">Gaps to plug</h2>
          <p className="t-secondary" style={{ marginTop: "var(--s2)" }}>
            A plug is your own number standing in for a line a sub did not price, so the columns
            stay comparable. It renders italic with a superscript p, is footnoted in the export, and
            never wins a per-line low.
          </p>

          <div className="rows" style={{ marginTop: "var(--s4)" }}>
            {grid.columns
              .filter((c) => !c.complete)
              .map((column) => (
                <div key={column.bid.id} className="stack" style={{ gap: "var(--s3)", paddingBlock: "var(--s4)" }}>
                  <span className="t-title">
                    {column.bid.subName} — {column.gapFormLineIds.length} unpriced
                  </span>
                  <ActionForm
                    action={addAdjustmentAction}
                    submitLabel="Plug it"
                    variant="secondary"
                    compact
                    hiddenFields={{ packageId: pkgId, bidId: column.bid.id, kind: "plug" }}
                  >
                    <label className="field" style={{ flex: 1, minWidth: 200 }}>
                      <span className="t-label">Line</span>
                      <select className="select" name="bidFormLineId" required defaultValue="">
                        <option value="" disabled>
                          Which line…
                        </option>
                        {grid.rows
                          .filter((r) => column.gapFormLineIds.includes(r.formLine.id))
                          .map((r) => (
                            <option key={r.formLine.id} value={r.formLine.id}>
                              {r.formLine.description}
                              {r.lowCents !== null ? ` — low ${moneyShort(r.lowCents)}` : ""}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="field" style={{ width: 140 }}>
                      <span className="t-label">Amount</span>
                      <input
                        className="input input-money"
                        name="amount"
                        inputMode="decimal"
                        required
                        placeholder="12,300"
                      />
                    </label>
                    <label className="field" style={{ flex: 1, minWidth: 200 }}>
                      <span className="t-label">Why</span>
                      <input
                        className="input"
                        name="reason"
                        required
                        maxLength={300}
                        placeholder="Plugged at Harlan's fire alarm number"
                      />
                    </label>
                  </ActionForm>
                </div>
              ))}
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------------- adjustments --- */}
      {adjustments.length > 0 ? (
        <section className="gutter" style={{ paddingTop: "var(--s6)" }}>
          <h2 className="t-label">Adjustments on the record</h2>
          <div className="rows" style={{ marginTop: "var(--s3)" }}>
            {adjustments.map((adj) => {
              const column = grid.columns.find((c) => c.bid.id === adj.bidId);
              const line = [...grid.rows, ...grid.alternateRows].find(
                (r) => r.formLine.id === adj.bidFormLineId,
              );
              return (
                <div key={adj.id} className="row" style={{ alignItems: "flex-start" }}>
                  <div className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                    <span className="t-data">
                      {adj.kind === "plug" ? "PLUG" : adj.kind === "scope_add" ? "SCOPE ADD" : "NORMALISE"}{" "}
                      {money(adj.amountCents)}
                    </span>
                    <span className="t-secondary">
                      {column?.bid.subName ?? "every bidder"}
                      {line ? ` · ${line.formLine.description}` : ""}
                    </span>
                    <span className="t-secondary" style={{ color: "var(--fg-3)" }}>
                      {adj.reason}
                    </span>
                  </div>
                  {writable ? (
                    <ActionForm
                      action={removeAdjustmentAction}
                      submitLabel="Remove"
                      variant="quiet"
                      compact
                      hiddenFields={{ adjustmentId: adj.id, projectId: id, packageId: pkgId }}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>

          {writable ? (
            <details style={{ marginTop: "var(--s5)" }}>
              <summary className="btn-quiet">Add a scope add or a normalisation</summary>
              <div style={{ marginTop: "var(--s4)" }}>
                <ActionForm
                  action={addAdjustmentAction}
                  submitLabel="Apply"
                  hiddenFields={{ packageId: pkgId }}
                >
                  <label className="field">
                    <span className="t-label">Kind</span>
                    <select className="select" name="kind" defaultValue="scope_add">
                      <option value="scope_add">Scope add — they are missing work</option>
                      <option value="normalize">Normalise — make the basis match</option>
                    </select>
                  </label>
                  <label className="field">
                    <span className="t-label">Applies to</span>
                    <select className="select" name="bidId" defaultValue="">
                      <option value="">Every column</option>
                      {grid.columns.map((c) => (
                        <option key={c.bid.id} value={c.bid.id}>
                          {c.bid.subName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="t-label">Amount (negative deducts)</span>
                    <input
                      className="input input-money"
                      name="amount"
                      inputMode="decimal"
                      required
                      placeholder="2,400 or -1,500"
                    />
                  </label>
                  <label className="field">
                    <span className="t-label">Why — this is footnoted in the export</span>
                    <input
                      className="input"
                      name="reason"
                      required
                      maxLength={300}
                      placeholder="Dumpsters not carried in the lump sum"
                    />
                  </label>
                </ActionForm>
              </div>
            </details>
          ) : null}
        </section>
      ) : writable && grid.columns.length > 0 ? (
        <section className="gutter" style={{ paddingTop: "var(--s6)" }}>
          <details>
            <summary className="btn-quiet">Add a scope add or a normalisation</summary>
            <div style={{ marginTop: "var(--s4)" }}>
              <ActionForm
                action={addAdjustmentAction}
                submitLabel="Apply"
                hiddenFields={{ packageId: pkgId }}
              >
                <label className="field">
                  <span className="t-label">Kind</span>
                  <select className="select" name="kind" defaultValue="scope_add">
                    <option value="scope_add">Scope add — they are missing work</option>
                    <option value="normalize">Normalise — make the basis match</option>
                  </select>
                </label>
                <label className="field">
                  <span className="t-label">Applies to</span>
                  <select className="select" name="bidId" defaultValue="">
                    <option value="">Every column</option>
                    {grid.columns.map((c) => (
                      <option key={c.bid.id} value={c.bid.id}>
                        {c.bid.subName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="t-label">Amount (negative deducts)</span>
                  <input
                    className="input input-money"
                    name="amount"
                    inputMode="decimal"
                    required
                    placeholder="2,400 or -1,500"
                  />
                </label>
                <label className="field">
                  <span className="t-label">Why — this is footnoted in the export</span>
                  <input
                    className="input"
                    name="reason"
                    required
                    maxLength={300}
                    placeholder="Dumpsters not carried in the lump sum"
                  />
                </label>
              </ActionForm>
            </div>
          </details>
        </section>
      ) : null}

      {/* ------------------------------------------------------------- award --- */}
      {writable && grid.columns.length > 0 ? (
        <section className="gutter" style={{ paddingTop: "var(--s6)" }}>
          <h2 className="t-label">
            <IconTrophyFlat size={16} /> Award this package
          </h2>

          {lowPreflight && lowPreflight.warnings.length > 0 ? (
            <ul
              className="stack notice"
              style={{ gap: "var(--s2)", marginTop: "var(--s3)", listStyle: "none" }}
            >
              {lowPreflight.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : (
            <p className="t-secondary" style={{ marginTop: "var(--s2)" }}>
              Nothing outstanding: every line is priced or plugged, no rows are waiting to be
              mapped, and every question has an answer.
            </p>
          )}

          <div className="stack" style={{ gap: "var(--s6)", marginTop: "var(--s5)" }}>
            {grid.columns.map((column) => {
              const flags = preflights.get(column.bid.id)!;
              return (
                <div key={column.bid.id} className="card" style={{ padding: "var(--s5)" }}>
                  <div
                    style={{ display: "flex", justifyContent: "space-between", gap: "var(--s3)" }}
                  >
                    <span className="t-title">{column.bid.subName}</span>
                    <span className="t-data" style={{ fontSize: 15 }}>
                      {money(column.adjustedTotalCents)}
                    </span>
                  </div>
                  <p className="t-secondary" style={{ marginTop: "var(--s2)" }}>
                    Base {moneyShort(column.baseCents)}
                    {column.plugCents !== 0 ? ` + plugs ${moneyShort(column.plugCents)}` : ""}
                    {column.adjustmentCents !== 0
                      ? ` + adjustments ${moneyShort(column.adjustmentCents)}`
                      : ""}
                    {column.isApparentLow ? " · apparent low" : ""}
                  </p>
                  {flags.warnings.length > 0 ? (
                    <p className="t-secondary" style={{ marginTop: "var(--s2)", color: "var(--warn)" }}>
                      {flags.warnings.length} flag{flags.warnings.length === 1 ? "" : "s"} to
                      acknowledge
                    </p>
                  ) : null}

                  <div style={{ marginTop: "var(--s4)" }}>
                    <ActionForm
                      action={awardPackageAction}
                      submitLabel={`Award ${column.bid.subName}`}
                      pendingLabel="Awarding…"
                      variant={column.isApparentLow ? "primary" : "secondary"}
                      confirm={`Award ${column.bid.subName} at ${money(column.adjustedTotalCents)}? This locks every bid on the package and sends the notices.`}
                      hiddenFields={{
                        packageId: pkgId,
                        bidId: column.bid.id,
                        warningCount: String(flags.warnings.length),
                      }}
                    >
                      <label className="field">
                        <span className="t-label">Note in the award email</span>
                        <input
                          className="input"
                          name="note"
                          maxLength={2000}
                          placeholder="Subcontract to follow this week. Start date holds at April 6."
                        />
                      </label>
                      <label
                        className="t-secondary"
                        style={{ display: "flex", gap: "var(--s2)", alignItems: "center" }}
                      >
                        <input type="checkbox" name="sendRegrets" defaultChecked value="on" />
                        Send regret notices to the other bidders
                      </label>
                    </ActionForm>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------------------ export --- */}
      <section className="gutter" style={{ paddingTop: "var(--s6)" }}>
        <h2 className="t-label">
          <IconDownload size={16} /> The owner-meeting artifact
        </h2>
        {canExport ? (
          <>
            <p className="t-secondary" style={{ marginTop: "var(--s2)" }}>
              Every plug marked, every adjustment footnoted, the inclusion/exclusion matrix
              included. Designed to be shown to an owner, not cleaned up first.
            </p>
            <div style={{ display: "flex", gap: "var(--s3)", marginTop: "var(--s4)", flexWrap: "wrap" }}>
              <a
                className="btn btn-secondary"
                href={`/api/exports/${pkgId}?format=pdf`}
                style={{ flex: "1 1 140px" }}
              >
                PDF
              </a>
              <a
                className="btn btn-secondary"
                href={`/api/exports/${pkgId}?format=csv`}
                style={{ flex: "1 1 140px" }}
              >
                CSV
              </a>
            </div>
          </>
        ) : (
          <div className="notice" style={{ marginTop: "var(--s3)" }}>
            Leveling exports are on {PLANS.builder.name} and up. The grid itself is on every plan —
            the grid is the product.{" "}
            <Link className="link" href="/settings/billing">
              See plans
            </Link>
          </div>
        )}
      </section>

      <div style={{ height: "var(--s8)" }} />
      <p className="gutter t-secondary" style={{ color: "var(--fg-3)" }}>
        Columns are ordered by when each bid arrived: {grid.columns.map((c) => initials(c.bid.subName)).join(" · ") || "—"}
      </p>
    </main>
  );
}
