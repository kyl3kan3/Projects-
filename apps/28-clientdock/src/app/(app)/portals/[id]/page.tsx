import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  findOwnedPortal,
  listContacts,
  listLinks,
  listPhases,
} from "@/lib/portals";
import { listFileStacks } from "@/lib/files";
import { listApprovals } from "@/lib/approvals";
import { listThreads, replyAddressFor } from "@/lib/messages";
import { listInvoices, invoiceLabel } from "@/lib/invoices";
import { loadAdoption } from "@/lib/portal-access";
import { latestTokenFor } from "@/lib/magic-auth";
import { portalUrl } from "@/lib/notify";
import { MODULE_IDS, type ModuleId } from "@/db/schema";
import { moduleAllowed, moduleUpsell, plan } from "@/lib/plans";
import {
  agoStamp,
  dayLabel,
  fileSize,
  money,
  overallProgress,
  stampDate,
  stampDateTime,
} from "@/lib/format";
import { Monogram } from "@/components/Monogram";
import { SignageChip } from "@/components/SignageChip";
import { ActionForm } from "@/components/ActionForm";
import { ModuleToggles } from "./ModuleToggles";
import { MODULE_COPY } from "@/components/module-copy";
import { IconEye } from "@/components/icons";
import {
  addContactAction,
  addLinkAction,
  addPhaseAction,
  deleteFileAction,
  deleteLinkAction,
  deletePhaseAction,
  inviteContactAction,
  publishAction,
  recordInvoiceAction,
  replyThreadAction,
  requestApprovalAction,
  revokeAccessAction,
  saveTemplateAction,
  setPhaseAction,
  startThreadAction,
  updateDetailsAction,
  uploadFileAction,
} from "../actions";

export const metadata: Metadata = { title: "Portal" };

export default async function PortalAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { workspace } = await requireUser();
  const { id } = await params;
  const portal = await findOwnedPortal(workspace.id, id);
  if (!portal) notFound();

  const modules = portal.enabledModules as ModuleId[];
  const on = (m: ModuleId) => modules.includes(m);
  const limits = plan(workspace.plan);

  const [contacts, phases, stacks, approvals, threads, invoices, links, adoption] =
    await Promise.all([
      portal.clientId ? listContacts(workspace.id, portal.clientId) : Promise.resolve([]),
      listPhases(portal.id),
      listFileStacks(portal.id),
      listApprovals(portal.id),
      listThreads(portal.id),
      listInvoices(portal.id),
      listLinks(portal.id),
      loadAdoption(portal.id),
    ]);

  const tokens = await Promise.all(
    contacts.map(async (c) => ({ contactId: c.id, token: await latestTokenFor(portal.id, c.id) })),
  );
  const publicUrl = portalUrl(workspace, portal);
  const allowedModules = MODULE_IDS.filter((m) => moduleAllowed(workspace.plan, m)) as ModuleId[];
  const gatedModules = MODULE_IDS.filter((m) => !moduleAllowed(workspace.plan, m)).map((m) => ({
    id: m as ModuleId,
    upsell: moduleUpsell(workspace.plan, m) ?? "",
  }));
  const currentFiles = stacks.map((s) => s.current);

  return (
    <main className="screen screen-app" style={{ maxWidth: 720 }}>
      <header className="pt-8 pb-6">
        <Link href="/dashboard" className="btn-quiet">
          Portals
        </Link>
        <div className="mt-4 flex items-center gap-3">
          <Monogram name={portal.title} solid />
          <div className="min-w-0 flex-1">
            <h1 className="t-h2 truncate">{portal.title}</h1>
            <p className="t-data mt-1" style={{ color: "var(--color-ink-3)" }}>
              UPDATED {agoStamp(portal.lastUpdatedAt)} · VIEWED {agoStamp(portal.lastViewedAt)}
            </p>
          </div>
          <SignageChip
            tone={portal.status === "active" ? "green" : portal.status === "draft" ? "neutral" : "neutral"}
          >
            {portal.status}
          </SignageChip>
        </div>
        <p className="t-data mt-4 break-all" style={{ color: "var(--color-ink-2)" }}>
          {publicUrl}
        </p>
        <Link href={`/p/${portal.slug}`} className="btn btn-secondary mt-3" style={{ height: 44 }}>
          <IconEye size={18} />
          View as your client
        </Link>
      </header>

      {/* ---------------------------------------------------------- access --- */}
      <section className="hairline-t py-6">
        <p className="t-label mb-1">Access</p>
        <p className="t-secondary mb-3">
          Clients never make a password. Each link works once and opens the portal on their device for
          two months.
        </p>
        {contacts.length === 0 ? (
          <p className="t-secondary py-2">
            Nobody yet. A portal with no contact is a portal nobody opens.
          </p>
        ) : (
          <div className="mb-4">
            {contacts.map((c) => {
              const token = tokens.find((t) => t.contactId === c.id)?.token;
              return (
                <div key={c.id} className="hairline-b py-3">
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="t-title block truncate">{c.name}</span>
                      <span className="t-data block truncate" style={{ color: "var(--color-ink-2)" }}>
                        {c.email}
                      </span>
                    </span>
                    {token ? (
                      <SignageChip tone={token.usedAt ? "green" : token.revokedAt ? "neutral" : "amber"}>
                        {token.usedAt ? "opened" : token.revokedAt ? "revoked" : "link sent"}
                      </SignageChip>
                    ) : (
                      <SignageChip>not invited</SignageChip>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-4">
                    <ActionForm
                      action={inviteContactAction}
                      hiddenFields={{ portalId: portal.id, contactId: c.id }}
                      submitLabel={token ? "Send a fresh link" : "Send the link"}
                      pendingLabel="Sending…"
                      variant="quiet"
                      compact
                    />
                    <ActionForm
                      action={revokeAccessAction}
                      hiddenFields={{ portalId: portal.id, contactId: c.id }}
                      submitLabel="Revoke unused links"
                      variant="quiet"
                      compact
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <ActionForm
          action={addContactAction}
          hiddenFields={{ portalId: portal.id }}
          submitLabel="Add contact"
          variant="secondary"
          compact
        >
          <label className="flex min-w-[140px] flex-1 flex-col gap-2">
            <span className="t-label">Name</span>
            <input className="input" name="name" placeholder="Priya Raman" />
          </label>
          <label className="flex min-w-[180px] flex-1 flex-col gap-2">
            <span className="t-label">Email</span>
            <input
              className="input input-mono"
              name="email"
              type="email"
              required
              placeholder="priya@meridianroasters.com"
            />
          </label>
        </ActionForm>
      </section>

      {/* --------------------------------------------------------- modules --- */}
      <section className="hairline-t py-6">
        <p className="t-label mb-1">Rooms</p>
        <p className="t-secondary mb-2">
          A module switched off stops being queried at all — switching it off withdraws the data, it
          doesn&apos;t hide it.
        </p>
        <ModuleToggles
          portalId={portal.id}
          enabled={modules}
          allowed={allowedModules}
          gated={gatedModules}
        />
      </section>

      {/* -------------------------------------------------------- timeline --- */}
      {on("timeline") ? (
        <section className="hairline-t py-6">
          <div className="mb-3 flex items-end justify-between">
            <p className="t-label">Timeline</p>
            <p className="t-data" style={{ color: "var(--color-ink-3)" }}>
              {overallProgress(phases)}% OVERALL
            </p>
          </div>
          {phases.length === 0 ? (
            <p className="t-secondary py-2">{MODULE_COPY.timeline.empty}</p>
          ) : (
            <div className="mb-4">
              {phases.map((phase) => (
                <div key={phase.id} className="hairline-b py-3">
                  <div className="flex items-baseline gap-3">
                    <span className="t-title min-w-0 flex-1 truncate">{phase.name}</span>
                    <span className="t-data" style={{ color: "var(--color-ink-3)" }}>
                      UPDATED {stampDate(phase.updatedAt)}
                    </span>
                  </div>
                  <div className="meter my-2">
                    <div className="meter-fill" style={{ width: `${phase.progressPct}%` }} />
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <ActionForm
                      action={setPhaseAction}
                      hiddenFields={{ portalId: portal.id, phaseId: phase.id }}
                      submitLabel="Update"
                      variant="secondary"
                      compact
                    >
                      <label className="flex flex-col gap-2" style={{ width: 88 }}>
                        <span className="t-label">Percent</span>
                        <input
                          className="input input-mono"
                          name="progressPct"
                          type="number"
                          min={0}
                          max={100}
                          defaultValue={phase.progressPct}
                        />
                      </label>
                      <label className="flex min-w-[160px] flex-1 flex-col gap-2">
                        <span className="t-label">Note</span>
                        <input
                          className="input"
                          name="note"
                          defaultValue={phase.note ?? ""}
                          placeholder="Copy deck with you for review"
                        />
                      </label>
                    </ActionForm>
                    <ActionForm
                      action={deletePhaseAction}
                      hiddenFields={{ portalId: portal.id, phaseId: phase.id }}
                      submitLabel="Remove"
                      variant="quiet"
                      compact
                      confirm={`Remove "${phase.name}" from the timeline?`}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          <ActionForm
            action={addPhaseAction}
            hiddenFields={{ portalId: portal.id }}
            submitLabel="Add phase"
            variant="secondary"
            compact
          >
            <label className="flex min-w-[160px] flex-1 flex-col gap-2">
              <span className="t-label">Phase</span>
              <input className="input" name="name" required placeholder="Design — homepage" />
            </label>
            <label className="flex flex-col gap-2" style={{ width: 88 }}>
              <span className="t-label">Percent</span>
              <input
                className="input input-mono"
                name="progressPct"
                type="number"
                min={0}
                max={100}
                defaultValue={0}
              />
            </label>
          </ActionForm>
        </section>
      ) : null}

      {/* ----------------------------------------------------------- files --- */}
      {on("files") ? (
        <section className="hairline-t py-6">
          <p className="t-label mb-3">Files</p>
          {stacks.length === 0 ? (
            <p className="t-secondary py-2">{MODULE_COPY.files.empty}</p>
          ) : (
            <div className="mb-4">
              {stacks.map((stack) => (
                <div key={stack.stackKey} className="hairline-b py-3">
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="t-title block truncate">{stack.current.name}</span>
                      <span className="t-data block" style={{ color: "var(--color-ink-2)" }}>
                        V{stack.current.version} · {fileSize(stack.current.size)} ·{" "}
                        {stack.current.uploadedBy === "client" ? "from client" : "yours"}
                      </span>
                    </span>
                    <SignageChip tone="accent">{stack.versions.length} versions</SignageChip>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-4">
                    {stack.versions.map((v) => (
                      <span key={v.id} className="t-data" style={{ color: "var(--color-ink-3)" }}>
                        V{v.version} {stampDate(v.createdAt)}
                      </span>
                    ))}
                    <ActionForm
                      action={deleteFileAction}
                      hiddenFields={{ portalId: portal.id, fileId: stack.current.id }}
                      submitLabel={`Delete v${stack.current.version}`}
                      variant="quiet"
                      compact
                      confirm={`Delete ${stack.current.name} v${stack.current.version}? The older versions stay.`}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <ActionForm
            action={uploadFileAction}
            hiddenFields={{ portalId: portal.id }}
            submitLabel="Upload"
            pendingLabel="Uploading…"
            variant="secondary"
            compact
          >
            <label className="flex min-w-[180px] flex-1 flex-col gap-2">
              <span className="t-label">File</span>
              <input className="input" name="file" type="file" required style={{ paddingTop: 12 }} />
            </label>
            <label className="flex min-w-[120px] flex-col gap-2">
              <span className="t-label">Folder</span>
              <input className="input" name="folder" placeholder="Deliverables" />
            </label>
            <p className="t-secondary basis-full">
              A file whose name matches one already here becomes its next version. Nothing is
              overwritten.
            </p>
          </ActionForm>
        </section>
      ) : null}

      {/* ------------------------------------------------------- approvals --- */}
      {on("approvals") ? (
        <section className="hairline-t py-6">
          <p className="t-label mb-3">Approvals</p>
          {approvals.length === 0 ? (
            <p className="t-secondary py-2">Nothing out for approval.</p>
          ) : (
            <div className="mb-4">
              {approvals.map(({ approval, file }) => (
                <div key={approval.id} className="hairline-b py-3">
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="t-title block truncate">{approval.title}</span>
                      <span className="t-secondary block truncate">
                        {file ? `${file.name} v${file.version}` : "No file attached"}
                      </span>
                    </span>
                    <SignageChip
                      tone={
                        approval.status === "approved"
                          ? "green"
                          : approval.status === "pending"
                            ? "amber"
                            : "neutral"
                      }
                    >
                      {approval.status === "changes_requested"
                        ? "changes requested"
                        : approval.status === "pending"
                          ? "awaiting them"
                          : "approved"}
                    </SignageChip>
                  </div>
                  {approval.decidedAt ? (
                    <p className="t-data mt-2" style={{ color: "var(--color-ink-2)" }}>
                      {approval.status === "approved" ? "APPROVED BY " : "CHANGES BY "}
                      {(approval.decidedByName ?? "").toUpperCase()} ·{" "}
                      {stampDateTime(approval.decidedAt)}
                    </p>
                  ) : null}
                  {approval.decisionComment ? (
                    <p className="t-secondary mt-1">“{approval.decisionComment}”</p>
                  ) : null}
                  <details className="mt-2">
                    <summary className="t-label" style={{ cursor: "pointer" }}>
                      Audit trail ({approval.audit.length})
                    </summary>
                    <ul className="mt-2">
                      {approval.audit.map((entry, i) => (
                        <li key={i} className="t-data py-1" style={{ color: "var(--color-ink-2)" }}>
                          {entry.event.replace("_", " ").toUpperCase()} · {entry.actor.toUpperCase()}{" "}
                          · {stampDateTime(new Date(entry.at))}
                          {entry.detail ? ` · ${entry.detail}` : ""}
                        </li>
                      ))}
                    </ul>
                  </details>
                  {approval.status !== "pending" && currentFiles.length > 0 ? (
                    <ActionForm
                      action={uploadFileAction}
                      hiddenFields={{ portalId: portal.id, reviseApprovalId: approval.id }}
                      submitLabel="Upload a revision"
                      pendingLabel="Uploading…"
                      variant="quiet"
                      compact
                      className="mt-2 flex flex-wrap items-end gap-3"
                    >
                      <label className="flex min-w-[180px] flex-1 flex-col gap-2">
                        <span className="t-label">New version</span>
                        <input
                          className="input"
                          name="file"
                          type="file"
                          required
                          style={{ paddingTop: 12 }}
                        />
                      </label>
                    </ActionForm>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          <ActionForm
            action={requestApprovalAction}
            hiddenFields={{ portalId: portal.id }}
            submitLabel="Request approval"
            variant="secondary"
          >
            <label className="flex flex-col gap-2">
              <span className="t-label">What are they approving?</span>
              <input className="input" name="title" required placeholder="Homepage v3" />
            </label>
            <label className="flex flex-col gap-2">
              <span className="t-label">Attach a file</span>
              <select className="input" name="fileId" defaultValue="">
                <option value="">No file — just the question</option>
                {currentFiles.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} v{f.version}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2">
              <span className="t-label">Note</span>
              <textarea
                className="input"
                name="body"
                rows={2}
                placeholder="Hero copy is the only change from v2."
              />
            </label>
          </ActionForm>
        </section>
      ) : null}

      {/* -------------------------------------------------------- messages --- */}
      {on("messages") ? (
        <section className="hairline-t py-6">
          <p className="t-label mb-3">Messages</p>
          {threads.length === 0 ? (
            <p className="t-secondary py-2">{MODULE_COPY.messages.empty}</p>
          ) : (
            <div className="mb-4">
              {threads.map(({ thread, messages: msgs, lastMessage }) => (
                <div key={thread.id} className="hairline-b py-3">
                  <div className="flex items-center gap-3">
                    <span className="t-title min-w-0 flex-1 truncate">{thread.subject}</span>
                    {lastMessage?.authorKind === "client" ? (
                      <SignageChip tone="amber">your turn</SignageChip>
                    ) : null}
                  </div>
                  <p className="t-data mt-1 break-all" style={{ color: "var(--color-ink-3)" }}>
                    REPLY-TO {replyAddressFor(thread)}
                  </p>
                  <ul className="mt-2">
                    {msgs.slice(-3).map((m) => (
                      <li key={m.id} className="py-1">
                        <span className="t-secondary">
                          <span className="t-data" style={{ color: "var(--color-ink-3)" }}>
                            {dayLabel(m.createdAt)}{" "}
                          </span>
                          <strong style={{ fontWeight: 600 }}>{m.authorName}</strong>
                          {m.viaEmail ? " (by email)" : ""}: {m.body}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <ActionForm
                    action={replyThreadAction}
                    hiddenFields={{ portalId: portal.id, threadId: thread.id }}
                    submitLabel="Reply"
                    variant="secondary"
                    compact
                    className="mt-2 flex flex-wrap items-end gap-3"
                  >
                    <label className="flex min-w-[200px] flex-1 flex-col gap-2">
                      <span className="t-label">Your reply</span>
                      <input className="input" name="body" required placeholder="On it — Thursday." />
                    </label>
                  </ActionForm>
                </div>
              ))}
            </div>
          )}

          <ActionForm
            action={startThreadAction}
            hiddenFields={{ portalId: portal.id }}
            submitLabel="Start a thread"
            variant="secondary"
          >
            <label className="flex flex-col gap-2">
              <span className="t-label">Subject</span>
              <input className="input" name="subject" required placeholder="This week on the rebuild" />
            </label>
            <label className="flex flex-col gap-2">
              <span className="t-label">Message</span>
              <textarea
                className="input"
                name="body"
                rows={3}
                required
                placeholder="Homepage is with you for approval. Pricing page starts Monday."
              />
            </label>
          </ActionForm>
        </section>
      ) : null}

      {/* -------------------------------------------------------- invoices --- */}
      {on("invoices") ? (
        <section className="hairline-t py-6">
          <p className="t-label mb-3">Invoices</p>
          {invoices.length === 0 ? (
            <p className="t-secondary py-2">{MODULE_COPY.invoices.empty}</p>
          ) : (
            <div className="mb-4">
              {invoices.map((invoice) => (
                <div key={invoice.id} className="row">
                  <span className="min-w-0 flex-1">
                    <span className="t-title block truncate">Invoice {invoice.number}</span>
                    <span className="t-data block" style={{ color: "var(--color-ink-2)" }}>
                      {money(invoice.amountCents, invoice.currency)}
                      {invoice.dueAt ? ` · DUE ${stampDate(invoice.dueAt)}` : ""}
                    </span>
                  </span>
                  <SignageChip tone={invoice.status === "paid" ? "green" : "amber"}>
                    {invoiceLabel(invoice.status)}
                  </SignageChip>
                </div>
              ))}
            </div>
          )}
          {workspace.stripeConnectId ? null : (
            <p className="t-secondary mb-3">
              Your Stripe account isn&apos;t connected yet, so paste the payment link from your own
              Stripe invoice —{" "}
              <Link href="/settings/billing" style={{ color: "var(--wl-accent)" }}>
                or connect Stripe
              </Link>{" "}
              and it comes across automatically.
            </p>
          )}
          <ActionForm
            action={recordInvoiceAction}
            hiddenFields={{ portalId: portal.id }}
            submitLabel="Put it on the portal"
            variant="secondary"
          >
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-2" style={{ width: 120 }}>
                <span className="t-label">Number</span>
                <input className="input input-mono" name="number" required placeholder="0042" />
              </label>
              <label className="flex flex-col gap-2" style={{ width: 120 }}>
                <span className="t-label">Amount</span>
                <input
                  className="input input-mono"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  placeholder="4800"
                />
              </label>
              <label className="flex flex-col gap-2" style={{ width: 160 }}>
                <span className="t-label">Due</span>
                <input className="input input-mono" name="dueAt" type="date" />
              </label>
            </div>
            <label className="flex flex-col gap-2">
              <span className="t-label">Stripe payment link</span>
              <input
                className="input input-mono"
                name="hostedInvoiceUrl"
                type="url"
                placeholder="https://invoice.stripe.com/…"
              />
            </label>
          </ActionForm>
        </section>
      ) : null}

      {/* ----------------------------------------------------------- links --- */}
      {on("links") ? (
        <section className="hairline-t py-6">
          <p className="t-label mb-3">Links</p>
          {links.length === 0 ? (
            <p className="t-secondary py-2">{MODULE_COPY.links.empty}</p>
          ) : (
            <div className="mb-4">
              {links.map((link) => (
                <div key={link.id} className="row">
                  <span className="min-w-0 flex-1">
                    <span className="t-title block truncate">{link.label}</span>
                    <span className="t-data block truncate" style={{ color: "var(--color-ink-2)" }}>
                      {link.url}
                    </span>
                  </span>
                  <ActionForm
                    action={deleteLinkAction}
                    hiddenFields={{ portalId: portal.id, linkId: link.id }}
                    submitLabel="Remove"
                    variant="quiet"
                    compact
                  />
                </div>
              ))}
            </div>
          )}
          <ActionForm
            action={addLinkAction}
            hiddenFields={{ portalId: portal.id }}
            submitLabel="Add link"
            variant="secondary"
            compact
          >
            <label className="flex min-w-[140px] flex-1 flex-col gap-2">
              <span className="t-label">Label</span>
              <input className="input" name="label" required placeholder="Figma — homepage" />
            </label>
            <label className="flex min-w-[200px] flex-1 flex-col gap-2">
              <span className="t-label">URL</span>
              <input
                className="input input-mono"
                name="url"
                type="url"
                required
                placeholder="https://figma.com/file/…"
              />
            </label>
          </ActionForm>
        </section>
      ) : null}

      {/* -------------------------------------------------------- adoption --- */}
      <section className="hairline-t py-6">
        <p className="t-label mb-1">Who&apos;s actually opening it</p>
        {limits.clientAnalytics ? null : (
          <p className="t-secondary mb-2" style={{ color: "var(--color-ink-3)" }}>
            Per-contact detail is a Studio feature — the totals below are on every plan.
          </p>
        )}
        {adoption.length === 0 ? (
          <p className="t-secondary py-2">
            No views yet. Nothing is wrong with the portal — the invitation just hasn&apos;t been
            opened.
          </p>
        ) : (
          adoption.map(({ contact, views, lastDay }) => (
            <div key={contact.id} className="row">
              <span className="min-w-0 flex-1">
                <span className="t-title block truncate">
                  {limits.clientAnalytics ? contact.name : contact.name.split(" ")[0]}
                </span>
                <span className="t-data block" style={{ color: "var(--color-ink-3)" }}>
                  LAST {lastDay ? stampDate(lastDay) : "—"}
                </span>
              </span>
              <span className="t-data">
                {views} view{views === 1 ? "" : "s"} / 30d
              </span>
            </div>
          ))
        )}
      </section>

      {/* --------------------------------------------------------- details --- */}
      <section className="hairline-t py-6">
        <p className="t-label mb-3">Wording</p>
        <ActionForm
          action={updateDetailsAction}
          hiddenFields={{ portalId: portal.id }}
          submitLabel="Save wording"
          variant="secondary"
        >
          <label className="flex flex-col gap-2">
            <span className="t-label">Portal title</span>
            <input className="input" name="title" defaultValue={portal.title} required />
          </label>
          <label className="flex flex-col gap-2">
            <span className="t-label">Prepared by</span>
            <input className="input" name="preparedBy" defaultValue={portal.preparedBy} />
          </label>
          <label className="flex flex-col gap-2">
            <span className="t-label">Welcome note</span>
            <textarea
              className="input"
              name="welcomeNote"
              rows={3}
              defaultValue={portal.welcomeNote ?? ""}
            />
          </label>
        </ActionForm>
      </section>

      {/* ------------------------------------------------------- lifecycle --- */}
      <section className="hairline-t py-6">
        <p className="t-label mb-3">Lifecycle</p>
        <div className="flex flex-col gap-4">
          {portal.status !== "active" ? (
            <ActionForm
              action={publishAction}
              hiddenFields={{ portalId: portal.id, status: "active" }}
              submitLabel="Make it live"
              variant="primary"
            />
          ) : (
            <ActionForm
              action={publishAction}
              hiddenFields={{ portalId: portal.id, status: "draft" }}
              submitLabel="Back to draft"
              variant="secondary"
            />
          )}
          <ActionForm
            action={saveTemplateAction}
            hiddenFields={{ portalId: portal.id }}
            submitLabel="Save as a template"
            variant="secondary"
            compact
          >
            <label className="flex min-w-[200px] flex-1 flex-col gap-2">
              <span className="t-label">Template name</span>
              <input
                className="input"
                name="templateName"
                placeholder={`${portal.title} setup`}
              />
            </label>
          </ActionForm>
          {portal.status !== "archived" ? (
            <ActionForm
              action={publishAction}
              hiddenFields={{ portalId: portal.id, status: "archived" }}
              submitLabel="Archive this portal"
              variant="quiet"
              confirm="Archive the portal? The client's links stop working, and nothing is deleted."
            />
          ) : (
            <ActionForm
              action={publishAction}
              hiddenFields={{ portalId: portal.id, status: "active" }}
              submitLabel="Reopen the portal"
              variant="secondary"
            />
          )}
        </div>
      </section>
    </main>
  );
}
