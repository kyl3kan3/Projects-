import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canWrite, requireUser } from "@/lib/auth";
import { ActionForm } from "@/components/ActionForm";
import { Pill, StatusPill } from "@/components/StatusPill";
import {
  IconBellRing,
  IconColumns,
  IconLink,
  IconPlus,
  IconQuestion,
  IconXSmall,
} from "@/components/icons";
import { divisionLabel } from "@/lib/csi";
import { agoStamp, dueStamp, money, stampDate, stampDateTime } from "@/lib/format";
import { boardFor } from "@/lib/invites";
import { listFormLines } from "@/lib/projects";
import { questionsFor } from "@/lib/questions";
import { listDirectory } from "@/lib/subs";
import {
  addFormLineAction,
  answerQuestionAction,
  closePackageAction,
  deleteFormLineAction,
  freshLinkAction,
  nudgeAction,
  revokeInviteAction,
  sendInvitesAction,
  transcribeBidAction,
  updatePackageAction,
} from "../../../actions";

export const metadata: Metadata = { title: "Package" };

export default async function PackagePage({
  params,
}: {
  params: Promise<{ id: string; pkgId: string }>;
}) {
  const { id, pkgId } = await params;
  const { company, user } = await requireUser();
  const board = await boardFor(company.id, pkgId);
  if (!board || board.project.id !== id) notFound();

  const [formLines, questions, directory] = await Promise.all([
    listFormLines(pkgId),
    questionsFor(company.id, pkgId),
    listDirectory(company.id, board.pkg.csiDivision),
  ]);

  const writable = canWrite(user.role) && board.pkg.status !== "awarded";
  const now = new Date();
  const invitedContactIds = new Set(board.rows.map((r) => r.contact.id));
  const uninvited = directory
    .map((entry) => ({
      ...entry,
      contacts: entry.contacts.filter((c) => !invitedContactIds.has(c.id)),
    }))
    .filter((entry) => entry.contacts.length > 0);
  const unanswered = questions.filter((q) => !q.question.answeredAt);
  const awaitingBid = board.rows.filter(
    (r) => r.status !== "submitted" && r.status !== "declined",
  );

  return (
    <main className="wrap">
      <header className="gutter" style={{ paddingBlock: "var(--s5)" }}>
        <Link href={`/projects/${id}`} className="t-secondary">
          ← {board.project.name}
        </Link>
        <p className="t-label" style={{ marginTop: "var(--s3)" }}>
          {board.pkg.csiDivision} · {divisionLabel(board.pkg.csiDivision)}
        </p>
        <h1 className="t-h2" style={{ marginTop: "var(--s1)" }}>
          {board.pkg.tradeLabel}
        </h1>
        <p className="t-data" style={{ color: "var(--fg-2)", marginTop: "var(--s2)" }}>
          {dueStamp(board.project.bidDueAt, now)}
        </p>
        <p className="t-secondary" style={{ marginTop: "var(--s2)" }}>
          {board.submitted} of {board.invited} bids in
          {board.declined > 0 ? ` · ${board.declined} declined` : ""}
          {board.noResponse > 0 ? ` · ${board.noResponse} no response` : ""}
        </p>
        {board.pkg.status === "awarded" ? (
          <div className="notice notice-ok" style={{ marginTop: "var(--s4)" }}>
            This package is awarded. Bids are read-only and the portal no longer accepts
            submissions.
          </div>
        ) : board.pkg.status === "closed" ? (
          <div className="notice" style={{ marginTop: "var(--s4)" }}>
            Closed to new bids. Reopen it if a sub asks for another day.
          </div>
        ) : null}
        {board.pkg.scopeNotes ? (
          <p className="notice notice-accent" style={{ marginTop: "var(--s4)" }}>
            {board.pkg.scopeNotes}
          </p>
        ) : null}
      </header>

      {/* --------------------------------------------------------- the board --- */}
      <section className="hairline-t" style={{ paddingTop: "var(--s5)" }}>
        <h2 className="t-label gutter">Bidders</h2>
        {board.rows.length === 0 ? (
          <p className="gutter t-secondary" style={{ marginTop: "var(--s3)" }}>
            Nobody invited yet. Pick subs below — you have {directory.length} in your directory
            tagged for this division.
          </p>
        ) : (
          <div className="rows stagger" style={{ marginTop: "var(--s3)" }}>
            {board.rows.map((row) => (
              <div key={row.invitation.id} className="row gutter" style={{ alignItems: "flex-start" }}>
                <div className="stack" style={{ gap: "var(--s1)", flex: 1, minWidth: 0 }}>
                  <span className="t-title">{row.subCompany.name}</span>
                  <span className="t-secondary" style={{ fontSize: 12 }}>
                    {row.contact.name} · {row.contact.email}
                  </span>
                  <span className="t-data" style={{ color: "var(--fg-3)", fontSize: 12 }}>
                    invited {stampDate(row.invitation.createdAt)}
                    {row.invitation.openedAt ? ` · opened ${stampDate(row.invitation.openedAt)}` : ""}
                    {row.reminders > 0 ? ` · ${row.reminders} reminder${row.reminders === 1 ? "" : "s"}` : ""}
                    {row.invitation.revokedAt ? " · link withdrawn" : ""}
                  </span>
                  {row.bid ? (
                    <span className="t-data" style={{ color: "var(--fg)" }}>
                      {money(row.bid.totalCents)}
                      {row.bid.kind === "lump_sum" ? " LUMP SUM" : ""}
                      {row.bid.revision > 1 ? ` · REV ${row.bid.revision}` : ""}
                      {row.bid.submittedAt ? ` · ${stampDateTime(row.bid.submittedAt)}` : ""}
                    </span>
                  ) : null}
                  {row.invitation.declineReason ? (
                    <span className="t-secondary" style={{ color: "var(--bad)", fontSize: 12 }}>
                      &ldquo;{row.invitation.declineReason}&rdquo;
                    </span>
                  ) : null}
                  {row.emails.some((e) => e.status === "bounced") ? (
                    <span className="t-secondary" style={{ color: "var(--bad)", fontSize: 12 }}>
                      Invite bounced — this address is not reaching them.
                    </span>
                  ) : null}
                  {writable ? (
                    <div style={{ display: "flex", gap: "var(--s4)", flexWrap: "wrap" }}>
                      <ActionForm
                        action={freshLinkAction}
                        submitLabel="Copy a fresh link"
                        variant="quiet"
                        compact
                        hiddenFields={{ invitationId: row.invitation.id }}
                      />
                      {!row.invitation.revokedAt ? (
                        <ActionForm
                          action={revokeInviteAction}
                          submitLabel="Withdraw link"
                          variant="quiet"
                          compact
                          confirm={`Withdraw ${row.subCompany.name}'s link? It stops working immediately.`}
                          hiddenFields={{
                            invitationId: row.invitation.id,
                            projectId: id,
                            packageId: pkgId,
                          }}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div style={{ flex: "none", paddingTop: 2 }}>
                  <StatusPill status={row.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* -------------------------------------------------------- invite subs --- */}
      {writable ? (
        <section className="hairline-t" style={{ marginTop: "var(--s6)", paddingTop: "var(--s5)" }}>
          <details className="gutter" open={board.rows.length === 0}>
            <summary className="btn-quiet">
              Invite subs for {divisionLabel(board.pkg.csiDivision).toLowerCase()}
            </summary>
            <div style={{ marginTop: "var(--s4)" }}>
              {uninvited.length === 0 ? (
                <p className="t-secondary">
                  Everyone in your directory tagged {board.pkg.csiDivision} is already invited.{" "}
                  <Link className="link" href="/subs">
                    Add another sub
                  </Link>
                  .
                </p>
              ) : (
                <ActionForm
                  action={sendInvitesAction}
                  submitLabel="Send invites"
                  pendingLabel="Sending…"
                  hiddenFields={{ packageId: pkgId }}
                >
                  <fieldset className="stack" style={{ gap: "var(--s3)", border: 0, padding: 0 }}>
                    <legend className="t-label" style={{ marginBottom: "var(--s2)" }}>
                      Who gets it
                    </legend>
                    {uninvited.map((entry) =>
                      entry.contacts.map((contact) => (
                        <label
                          key={contact.id}
                          style={{
                            display: "flex",
                            gap: "var(--s3)",
                            alignItems: "flex-start",
                            minHeight: 44,
                          }}
                        >
                          <input
                            type="checkbox"
                            name="subContactId"
                            value={contact.id}
                            style={{ marginTop: 4 }}
                          />
                          <span className="stack" style={{ gap: 0 }}>
                            <span className="t-title" style={{ fontSize: 15 }}>
                              {entry.sub.name}
                            </span>
                            <span className="t-secondary" style={{ fontSize: 12 }}>
                              {contact.name} · {contact.email}
                              {entry.sub.city ? ` · ${entry.sub.city}` : ""}
                            </span>
                            {entry.sub.performanceNote ? (
                              <span className="t-secondary" style={{ fontSize: 12 }}>
                                {entry.sub.performanceNote}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      )),
                    )}
                  </fieldset>
                  <label className="field">
                    <span className="t-label">Personal note (goes in the email)</span>
                    <textarea
                      className="textarea"
                      name="personalNote"
                      maxLength={2000}
                      placeholder="Hal — this is the Fulton Yard job we walked in February. Same tenant, second building."
                    />
                  </label>
                </ActionForm>
              )}
            </div>
          </details>
        </section>
      ) : null}

      {/* ---------------------------------------------------------- bid form --- */}
      <section className="hairline-t" style={{ marginTop: "var(--s6)", paddingTop: "var(--s5)" }}>
        <div
          className="gutter"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}
        >
          <h2 className="t-label">Bid form</h2>
          <span className="t-data" style={{ color: "var(--fg-3)" }}>
            {formLines.length} LINES
          </span>
        </div>
        <p className="gutter t-secondary" style={{ marginTop: "var(--s2)" }}>
          These are the rows every bidder prices. They are also the rows of the leveling grid —
          which is why bids come back comparable instead of arriving as twelve different PDFs.
        </p>

        {formLines.length === 0 ? (
          <p className="gutter notice notice-bad" style={{ marginTop: "var(--s4)" }}>
            No lines yet. A bidder with no form can only submit a lump sum, and a lump sum cannot be
            leveled line by line.
          </p>
        ) : (
          <ol className="rows" style={{ marginTop: "var(--s3)", listStyle: "none" }}>
            {formLines.map((line) => (
              <li key={line.id} className="row gutter">
                <div className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                  <span className="t-body" style={{ fontSize: 15 }}>
                    {line.description}
                  </span>
                  {line.quantity || line.unit || line.isAlternate || line.isAllowance ? (
                    <span className="t-data" style={{ color: "var(--fg-3)", fontSize: 12 }}>
                      {[
                        line.quantity && line.unit ? `${line.quantity} ${line.unit}` : line.unit,
                        line.isAlternate ? "ALTERNATE" : null,
                        line.isAllowance ? "ALLOWANCE" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  ) : null}
                </div>
                {writable ? (
                  <ActionForm
                    action={deleteFormLineAction}
                    submitLabel="Remove"
                    variant="quiet"
                    compact
                    hiddenFields={{ packageId: pkgId, formLineId: line.id }}
                  />
                ) : null}
              </li>
            ))}
          </ol>
        )}

        {writable ? (
          <details className="gutter" style={{ marginTop: "var(--s5)" }}>
            <summary className="btn-quiet">
              <IconPlus size={16} /> Add a line
            </summary>
            <div style={{ marginTop: "var(--s4)" }}>
              <ActionForm
                action={addFormLineAction}
                submitLabel="Add line"
                hiddenFields={{ packageId: pkgId }}
              >
                <label className="field">
                  <span className="t-label">Description</span>
                  <input
                    className="input"
                    name="description"
                    required
                    maxLength={300}
                    placeholder="Panelboards and feeders"
                  />
                </label>
                <div style={{ display: "flex", gap: "var(--s3)" }}>
                  <label className="field" style={{ flex: 1 }}>
                    <span className="t-label">Qty</span>
                    <input className="input" name="quantity" maxLength={24} placeholder="4" />
                  </label>
                  <label className="field" style={{ flex: 1 }}>
                    <span className="t-label">Unit</span>
                    <input className="input" name="unit" maxLength={24} placeholder="EA" />
                  </label>
                </div>
                <label
                  className="t-secondary"
                  style={{ display: "flex", gap: "var(--s2)", alignItems: "center" }}
                >
                  <input type="checkbox" name="isAlternate" />
                  Alternate — priced beside the base total, never inside it
                </label>
                <label
                  className="t-secondary"
                  style={{ display: "flex", gap: "var(--s2)", alignItems: "center" }}
                >
                  <input type="checkbox" name="isAllowance" />
                  Allowance
                </label>
              </ActionForm>
            </div>
          </details>
        ) : null}
      </section>

      {/* -------------------------------------------------------------- Q&A --- */}
      <section className="hairline-t" style={{ marginTop: "var(--s6)", paddingTop: "var(--s5)" }}>
        <div
          className="gutter"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}
        >
          <h2 className="t-label">
            <IconQuestion size={16} /> Questions
          </h2>
          {unanswered.length > 0 ? <Pill tone="amber">{unanswered.length} WAITING</Pill> : null}
        </div>

        {questions.length === 0 ? (
          <p className="gutter t-secondary" style={{ marginTop: "var(--s3)" }}>
            No questions yet. When one comes in, your answer goes to every bidder on this trade at
            once — which is what keeps the pricing defensible.
          </p>
        ) : (
          <div className="rows" style={{ marginTop: "var(--s3)" }}>
            {questions.map(({ question, asker }) => (
              <div
                key={question.id}
                className="gutter stack"
                style={{ gap: "var(--s3)", paddingBlock: "var(--s4)" }}
              >
                <div className="stack" style={{ gap: "var(--s1)" }}>
                  <span className="t-data" style={{ color: "var(--fg-3)", fontSize: 12 }}>
                    {asker.name.toUpperCase()} · {stampDate(question.createdAt)}
                  </span>
                  <p className="t-body">{question.body}</p>
                </div>

                {question.answerBody ? (
                  <div
                    style={{
                      marginLeft: "var(--s4)",
                      paddingLeft: "var(--s3)",
                      borderLeft: "2px solid var(--accent)",
                    }}
                  >
                    <p className="t-body">{question.answerBody}</p>
                    <p className="t-label" style={{ marginTop: "var(--s2)" }}>
                      {question.broadcastAt
                        ? `ANSWERED TO ALL BIDDERS · ${stampDate(question.broadcastAt)}`
                        : "ANSWERED PRIVATELY"}
                    </p>
                  </div>
                ) : writable ? (
                  <ActionForm
                    action={answerQuestionAction}
                    submitLabel="Answer and broadcast"
                    hiddenFields={{ questionId: question.id, projectId: id, packageId: pkgId }}
                  >
                    <textarea
                      className="textarea"
                      name="answer"
                      required
                      maxLength={4000}
                      placeholder="The owner is furnishing fixtures; carry installation only. Addendum 2 will confirm."
                    />
                    <label
                      className="t-secondary"
                      style={{ display: "flex", gap: "var(--s2)", alignItems: "center" }}
                    >
                      <input type="checkbox" name="broadcast" defaultChecked value="on" />
                      Send to every bidder on this trade
                    </label>
                  </ActionForm>
                ) : (
                  <p className="t-secondary">Waiting on an answer.</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ------------------------------------------------------- transcribe --- */}
      {writable && awaitingBid.length > 0 && formLines.length > 0 ? (
        <section className="hairline-t" style={{ marginTop: "var(--s6)", paddingTop: "var(--s5)" }}>
          <details className="gutter">
            <summary className="btn-quiet">Enter a bid that came in by email or phone</summary>
            <p className="t-secondary" style={{ marginTop: "var(--s3)" }}>
              Some subs will always send a PDF. Type it in here so the leveling grid has no holes —
              it is marked as entered by you, not submitted by them.
            </p>
            <div style={{ marginTop: "var(--s4)" }}>
              <ActionForm
                action={transcribeBidAction}
                submitLabel="Save this bid"
                hiddenFields={{ packageId: pkgId }}
              >
                <label className="field">
                  <span className="t-label">Whose bid</span>
                  <select className="select" name="invitationId" required defaultValue="">
                    <option value="" disabled>
                      Pick a bidder…
                    </option>
                    {awaitingBid.map((row) => (
                      <option key={row.invitation.id} value={row.invitation.id}>
                        {row.subCompany.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="t-label">Shape of the bid</span>
                  <select className="select" name="kind" defaultValue="itemized">
                    <option value="itemized">Itemized against the bid form</option>
                    <option value="lump_sum">Lump sum only</option>
                  </select>
                </label>
                <label className="field">
                  <span className="t-label">Lump sum (if lump sum)</span>
                  <input
                    className="input input-money"
                    name="lumpSum"
                    inputMode="decimal"
                    placeholder="164,900"
                  />
                </label>

                <fieldset className="stack" style={{ gap: "var(--s3)", border: 0, padding: 0 }}>
                  <legend className="t-label">Line amounts</legend>
                  {formLines.map((line) => (
                    <div key={line.id} className="stack" style={{ gap: "var(--s2)" }}>
                      <span className="t-secondary">
                        {line.description}
                        {line.isAlternate ? " (alternate)" : ""}
                      </span>
                      <div style={{ display: "flex", gap: "var(--s3)", alignItems: "center" }}>
                        <input
                          className="input input-money"
                          name={`amount:${line.id}`}
                          inputMode="decimal"
                          placeholder="—"
                          style={{ flex: 1 }}
                        />
                        <label
                          className="t-secondary"
                          style={{ display: "flex", gap: 6, alignItems: "center", flex: "none" }}
                        >
                          <input type="checkbox" name={`excluded:${line.id}`} />
                          Excl
                        </label>
                      </div>
                    </div>
                  ))}
                </fieldset>

                <label className="field">
                  <span className="t-label">Notes</span>
                  <textarea
                    className="textarea"
                    name="notes"
                    maxLength={4000}
                    placeholder="Emailed PDF 3/15, 4:40pm. Excludes fire alarm; said they would carry it for $12,300 if asked."
                  />
                </label>
              </ActionForm>
            </div>
          </details>
        </section>
      ) : null}

      {/* ---------------------------------------------------- package status --- */}
      {canWrite(user.role) ? (
        <section className="hairline-t" style={{ marginTop: "var(--s6)", paddingTop: "var(--s5)" }}>
          <details className="gutter">
            <summary className="btn-quiet">Package settings</summary>
            <div className="stack" style={{ marginTop: "var(--s4)", gap: "var(--s6)" }}>
              {board.pkg.status !== "awarded" ? (
                <ActionForm
                  action={updatePackageAction}
                  submitLabel="Save scope"
                  hiddenFields={{ packageId: pkgId }}
                >
                  <label className="field">
                    <span className="t-label">Trade label</span>
                    <input
                      className="input"
                      name="tradeLabel"
                      defaultValue={board.pkg.tradeLabel}
                      maxLength={120}
                    />
                  </label>
                  <label className="field">
                    <span className="t-label">Scope notes</span>
                    <textarea
                      className="textarea"
                      name="scopeNotes"
                      defaultValue={board.pkg.scopeNotes ?? ""}
                      maxLength={4000}
                    />
                  </label>
                </ActionForm>
              ) : null}

              {board.pkg.status !== "awarded" ? (
                <ActionForm
                  action={closePackageAction}
                  submitLabel={
                    board.pkg.status === "closed" ? "Reopen to bids" : "Close to new bids"
                  }
                  variant="secondary"
                  hiddenFields={{ packageId: pkgId }}
                />
              ) : null}
            </div>
          </details>
        </section>
      ) : null}

      <div className="sticky-actions" style={{ marginTop: "var(--s7)" }}>
        {writable && awaitingBid.length > 0 ? (
          <ActionForm
            action={nudgeAction}
            submitLabel="Send reminder"
            pendingLabel="Sending…"
            variant="secondary"
            className="bell-tip"
            hiddenFields={{ packageId: pkgId, projectId: id }}
          />
        ) : null}
        <Link
          href={`/projects/${id}/packages/${pkgId}/leveling`}
          className="btn btn-primary"
          style={{ flex: 1 }}
        >
          <IconColumns size={18} />
          Level bids
        </Link>
      </div>
      {writable && awaitingBid.length > 0 ? (
        <p className="gutter t-secondary" style={{ marginTop: "calc(var(--s3) * -1)" }}>
          <IconBellRing size={14} /> {awaitingBid.length} bidder
          {awaitingBid.length === 1 ? "" : "s"} still owe you a number. Automatic reminders go out
          at T-7, T-3 and T-1; this button nudges everyone now, once a day at most.
        </p>
      ) : null}
      {board.rows.some((r) => r.invitation.revokedAt) ? (
        <p className="gutter t-secondary" style={{ marginTop: "var(--s3)" }}>
          <IconXSmall size={14} /> A withdrawn link cannot be re-opened by the sub; use{" "}
          <IconLink size={14} /> Copy a fresh link to give it back.
        </p>
      ) : null}
      <p className="gutter t-secondary" style={{ marginTop: "var(--s3)", color: "var(--fg-3)" }}>
        Last activity {agoStamp(
          board.rows.reduce<Date | null>(
            (latest, r) => (!latest || (r.lastEmailAt && r.lastEmailAt > latest) ? (r.lastEmailAt ?? latest) : latest),
            null,
          ),
          now,
        ).toLowerCase()}
      </p>
    </main>
  );
}
