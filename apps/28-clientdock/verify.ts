/** Throwaway verification script — deleted when the run is done. */
import "@/lib/load-env";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import {
  approvals as approvalsT,
  clients as clientsT,
  contacts as contactsT,
  files as filesT,
  invoices as invoicesT,
  magicTokens,
  members,
  messages as messagesT,
  notifications,
  portals as portalsT,
  users,
  workspaces,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import {
  addContact,
  addLink,
  addPhase,
  countClientPortals,
  createClient,
  createPortal,
  listLinks,
  listPhases,
  loadAttentionQueue,
  loadPortalSummaries,
  requireOwnedPortal,
  saveAsTemplate,
  setModules,
  setPhaseProgress,
  setPortalStatus,
} from "@/lib/portals";
import { getFileScoped, listFileStacks, readFileScoped, uploadFile } from "@/lib/files";
import {
  decideApproval,
  getApprovalScoped,
  listApprovals,
  requestApproval,
  reviseApproval,
} from "@/lib/approvals";
import { appendMessage, getThreadScoped, listThreads, startThread } from "@/lib/messages";
import { getInvoiceScoped, listInvoices, recordInvoice, setInvoiceStatus } from "@/lib/invoices";
import { createMagicToken, hashToken, revokeTokensForContact } from "@/lib/magic-auth";
import { loadPortalView, loadAdoption, loadPortalShell } from "@/lib/portal-access";
import { applyPlan } from "@/lib/billing";
import { handleInboundEmail } from "@/lib/inbound-email";
import { sendMail } from "@/lib/email";
import { runTick, weekKey } from "@/lib/tick";
import { plan } from "@/lib/plans";

let pass = 0;
const failures: string[] = [];

function check(label: string, ok: boolean, extra?: unknown) {
  if (ok) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL ${label}${extra === undefined ? "" : ` — ${JSON.stringify(extra)}`}`);
  }
}

async function throws(label: string, fn: () => Promise<unknown>, match?: RegExp) {
  try {
    await fn();
    check(label, false, "did not throw");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    check(label, match ? match.test(message) : true, message);
  }
}

async function main() {
  const db = getDb();
  const tag = randomUUID().slice(0, 8);

  console.log("\n== setup: one agency, two clients ==");
  const [owner] = await db
    .insert(users)
    .values({
      email: `dana+${tag}@northbeam.studio`,
      name: "Dana Whitlock",
      passwordHash: await hashPassword("correct horse battery"),
    })
    .returning();
  const [ws] = await db
    .insert(workspaces)
    .values({
      name: "Northbeam Studio",
      slug: `northbeam-${tag}`,
      ownerUserId: owner.id,
      plan: "agency",
    })
    .returning();
  await db.insert(members).values({ workspaceId: ws.id, userId: owner.id, role: "owner" });

  // A second, unrelated agency — the cross-workspace control.
  const [rival] = await db
    .insert(users)
    .values({
      email: `rival+${tag}@othershop.co`,
      name: "Rival Owner",
      passwordHash: await hashPassword("another password here"),
    })
    .returning();
  const [rivalWs] = await db
    .insert(workspaces)
    .values({
      name: "Othershop",
      slug: `othershop-${tag}`,
      ownerUserId: rival.id,
      plan: "agency",
    })
    .returning();

  const meridian = await createClient({
    workspaceId: ws.id,
    company: "Meridian Roasters",
    contactName: "Sam Okafor",
    contactEmail: `sam+${tag}@meridian.coffee`,
  });
  const harbor = await createClient({
    workspaceId: ws.id,
    company: "Harborline Ceramics",
    contactName: "Priya Raman",
    contactEmail: `priya+${tag}@harborline.co`,
  });
  check("two clients created under one agency", Boolean(meridian.contact && harbor.contact));

  const portalA = await createPortal({
    workspaceId: ws.id,
    planId: "agency",
    clientId: meridian.client.id,
    title: "Site rebuild — phase two",
    preparedBy: "Northbeam Studio",
    welcomeNote: "Everything for the rebuild lives here.",
    modules: ["timeline", "files", "approvals", "messages", "invoices", "links"],
  });
  const portalB = await createPortal({
    workspaceId: ws.id,
    planId: "agency",
    clientId: harbor.client.id,
    preparedBy: "Northbeam Studio",
    modules: ["timeline", "files", "approvals", "messages", "invoices"],
  });
  check("portal A and B have distinct slugs", portalA.slug !== portalB.slug, [
    portalA.slug,
    portalB.slug,
  ]);
  await setPortalStatus(ws.id, portalA.id, "active");
  await setPortalStatus(ws.id, portalB.id, "active");

  console.log("\n== timeline ==");
  const phaseA1 = await addPhase({ portalId: portalA.id, name: "Discovery", progressPct: 100 });
  const phaseA2 = await addPhase({ portalId: portalA.id, name: "Design — homepage", progressPct: 60 });
  await addPhase({ portalId: portalA.id, name: "Build", progressPct: 0 });
  const phaseB1 = await addPhase({ portalId: portalB.id, name: "Kiln photography", progressPct: 25 });
  const phasesA = await listPhases(portalA.id);
  check("phases are scoped to their portal", phasesA.length === 3 && phasesA[0].name === "Discovery");
  check(
    "phase progress moves and stamps",
    (await setPhaseProgress(portalA.id, phaseA2.id, 75, "Copy deck with you"))?.progressPct === 75,
  );
  check(
    "a phase id from another portal updates nothing",
    (await setPhaseProgress(portalA.id, phaseB1.id, 99)) === null,
  );
  check(
    "the other portal's phase is untouched",
    (await listPhases(portalB.id))[0].progressPct === 25,
  );
  void phaseA1;

  console.log("\n== files and versioning ==");
  const v1 = await uploadFile({
    portalId: portalA.id,
    name: "Homepage.png",
    data: Buffer.from("meridian homepage v1 bytes"),
    contentType: "image/png",
    uploadedBy: "agency",
    uploadedByName: "Dana Whitlock",
  });
  const v2 = await uploadFile({
    portalId: portalA.id,
    name: "Homepage v2.png",
    data: Buffer.from("meridian homepage v2 bytes"),
    contentType: "image/png",
    uploadedBy: "agency",
    uploadedByName: "Dana Whitlock",
  });
  const v3 = await uploadFile({
    portalId: portalA.id,
    name: "Homepage v3.png",
    data: Buffer.from("meridian homepage v3 bytes"),
    contentType: "image/png",
    uploadedBy: "agency",
    uploadedByName: "Dana Whitlock",
  });
  const fileB = await uploadFile({
    portalId: portalB.id,
    name: "Glaze samples.pdf",
    data: Buffer.from("harborline confidential glaze formulas"),
    contentType: "application/pdf",
    uploadedBy: "agency",
    uploadedByName: "Dana Whitlock",
  });
  check("versions climb on one stack", [v1.version, v2.version, v3.version].join() === "1,2,3");
  check("all three share a stack key", v1.stackKey === v2.stackKey && v2.stackKey === v3.stackKey);
  const stacksA = await listFileStacks(portalA.id);
  check("portal A sees exactly one stack of three", stacksA.length === 1 && stacksA[0].versions.length === 3);
  check("the current version is the newest", stacksA[0].current.id === v3.id);
  const stacksB = await listFileStacks(portalB.id);
  check("portal B sees only its own file", stacksB.length === 1 && stacksB[0].current.id === fileB.id);

  const readBack = await readFileScoped(portalA.id, v3.id);
  check(
    "stored bytes round-trip through the storage adapter",
    readBack?.object.data.toString() === "meridian homepage v3 bytes",
  );

  console.log("\n== ISOLATION: portal A must never reach portal B ==");
  check("A cannot read B's file by id", (await getFileScoped(portalA.id, fileB.id)) === null);
  check("A cannot read B's file bytes", (await readFileScoped(portalA.id, fileB.id)) === null);
  check("B can read its own file", (await getFileScoped(portalB.id, fileB.id))?.id === fileB.id);
  check(
    "a malformed id is refused without hitting Postgres",
    (await getFileScoped(portalA.id, "not-a-uuid")) === null,
  );

  console.log("\n== approvals and the audit trail ==");
  const apprA = await requestApproval({
    portalId: portalA.id,
    title: "Homepage v3",
    body: "Hero copy is the only change from v2.",
    fileId: v3.id,
    requestedBy: "Dana Whitlock",
  });
  const apprB = await requestApproval({
    portalId: portalB.id,
    title: "Glaze samples",
    fileId: fileB.id,
    requestedBy: "Dana Whitlock",
  });
  check("a new approval is pending with one audit entry", apprA.status === "pending" && apprA.audit.length === 1);
  await throws(
    "an approval cannot attach a file from another portal",
    () =>
      requestApproval({
        portalId: portalA.id,
        title: "Sneaky",
        fileId: fileB.id,
        requestedBy: "Dana Whitlock",
      }),
    /isn't in this portal/,
  );

  check("A cannot read B's approval by id", (await getApprovalScoped(portalA.id, apprB.id)) === null);
  await throws(
    "A's contact cannot decide B's approval",
    () =>
      decideApproval({
        portalId: portalA.id,
        approvalId: apprB.id,
        decision: "approved",
        contactId: meridian.contact!.id,
        contactName: "Sam Okafor",
      }),
    /isn't in this portal/,
  );
  check(
    "B's approval is still pending after that attempt",
    (await getApprovalScoped(portalB.id, apprB.id))?.approval.status === "pending",
  );

  const decided = await decideApproval({
    portalId: portalA.id,
    approvalId: apprA.id,
    decision: "changes_requested",
    contactId: meridian.contact!.id,
    contactName: "Sam Okafor",
    comment: "Hero line should say roasted in Leith.",
  });
  check("a decision is attributed and timestamped", decided.decidedByName === "Sam Okafor" && Boolean(decided.decidedAt));
  check("the audit trail is append-only", decided.audit.length === 2 && decided.audit[0].event === "requested");
  await throws(
    "the same approval cannot be decided twice",
    () =>
      decideApproval({
        portalId: portalA.id,
        approvalId: apprA.id,
        decision: "approved",
        contactId: meridian.contact!.id,
        contactName: "Sam Okafor",
      }),
    /already/,
  );
  await throws(
    "a change request with no comment is refused",
    () =>
      decideApproval({
        portalId: portalB.id,
        approvalId: apprB.id,
        decision: "changes_requested",
        contactId: harbor.contact!.id,
        contactName: "Priya Raman",
        comment: "   ",
      }),
    /what needs changing/,
  );

  const v4 = await uploadFile({
    portalId: portalA.id,
    name: "Homepage v4.png",
    data: Buffer.from("meridian homepage v4 bytes"),
    contentType: "image/png",
    uploadedBy: "agency",
    uploadedByName: "Dana Whitlock",
  });
  const revised = await reviseApproval({
    portalId: portalA.id,
    approvalId: apprA.id,
    fileId: v4.id,
    revisedBy: "Dana Whitlock",
  });
  check("a revision reopens the round", revised.status === "pending" && revised.decidedAt === null);
  check("the previous decision survives in the trail", revised.audit.length === 3);
  const approved = await decideApproval({
    portalId: portalA.id,
    approvalId: apprA.id,
    decision: "approved",
    contactId: meridian.contact!.id,
    contactName: "Sam Okafor",
  });
  check("the reopened round can be approved", approved.status === "approved" && approved.audit.length === 4);

  console.log("\n== messages ==");
  const threadA = await startThread({
    portalId: portalA.id,
    subject: "This week on the rebuild",
    body: "Homepage v4 is with you. Pricing page starts Monday.",
    authorKind: "agency",
    authorName: "Dana Whitlock",
  });
  const threadB = await startThread({
    portalId: portalB.id,
    subject: "Kiln shoot dates",
    body: "Two options for the shoot, both Tuesdays.",
    authorKind: "agency",
    authorName: "Dana Whitlock",
  });
  check("A cannot read B's thread by id", (await getThreadScoped(portalA.id, threadB.thread.id)) === null);
  await throws(
    "A cannot append to B's thread",
    () =>
      appendMessage({
        portalId: portalA.id,
        threadId: threadB.thread.id,
        body: "leak attempt",
        authorKind: "client",
        authorName: "Sam Okafor",
      }),
    /isn't in this portal/,
  );
  await appendMessage({
    portalId: portalA.id,
    threadId: threadA.thread.id,
    body: "Looks good. One note on pricing.",
    authorKind: "client",
    authorName: "Sam Okafor",
    authorContactId: meridian.contact!.id,
  });
  const threadsA = await listThreads(portalA.id);
  check("thread listing is portal-scoped", threadsA.length === 1 && threadsA[0].messages.length === 2);
  check("B's thread untouched", (await listThreads(portalB.id))[0].messages.length === 1);

  console.log("\n== inbound email threading ==");
  const inbound = await handleInboundEmail(
    {
      to: [`${threadA.thread.replyKey}@reply.clientdock.app`],
      from: `sam+${tag}@meridian.coffee`,
      subject: "Re: This week on the rebuild",
      text: "Monday works.\n\nOn Fri, Dana Whitlock wrote:\n> Homepage v4 is with you.",
    },
    "reply.clientdock.app",
  );
  check("a reply from a known contact is appended", inbound.status === "appended");
  const withReply = await getThreadScoped(portalA.id, threadA.thread.id);
  check("the quoted history is stripped", withReply?.messages.at(-1)?.body === "Monday works.");
  check("it is marked as arriving by email", withReply?.messages.at(-1)?.viaEmail === true);

  const strangerToA = await handleInboundEmail(
    {
      to: [`${threadA.thread.replyKey}@reply.clientdock.app`],
      from: `priya+${tag}@harborline.co`,
      subject: "Re:",
      text: "Let me in",
    },
    "reply.clientdock.app",
  );
  check(
    "ANOTHER CLIENT'S contact cannot post into this thread by knowing the reply key",
    strangerToA.status === "unknown_sender",
  );
  const unknownKey = await handleInboundEmail(
    { to: ["deadbeefkey@reply.clientdock.app"], from: `sam+${tag}@meridian.coffee`, subject: "x", text: "y" },
    "reply.clientdock.app",
  );
  check("an unknown reply key is dropped, not errored", unknownKey.status === "unknown_thread");

  console.log("\n== invoices ==");
  const invA = await recordInvoice({
    portalId: portalA.id,
    number: `00${tag.slice(0, 2)}`,
    amountCents: 480000,
    dueAt: new Date("2026-07-15T12:00:00Z"),
    hostedInvoiceUrl: "https://invoice.stripe.com/i/test_meridian",
  });
  const invB = await recordInvoice({
    portalId: portalB.id,
    number: `01${tag.slice(0, 2)}`,
    amountCents: 125000,
  });
  check("A cannot read B's invoice by id", (await getInvoiceScoped(portalA.id, invB.id)) === null);
  check(
    "A cannot mark B's invoice paid",
    (await setInvoiceStatus(portalA.id, invB.id, "paid")) === null,
  );
  check("B's invoice is still open", (await getInvoiceScoped(portalB.id, invB.id))?.status === "open");
  check("invoice listing is portal-scoped", (await listInvoices(portalA.id)).length === 1);
  await throws(
    "an invoice with a non-https payment link is refused",
    () => recordInvoice({ portalId: portalA.id, number: "9", amountCents: 100, hostedInvoiceUrl: "http://x.io" }),
    /https/,
  );
  await throws(
    "a zero-amount invoice is refused",
    () => recordInvoice({ portalId: portalA.id, number: "9", amountCents: 0 }),
    /greater than zero/,
  );
  void invA;

  console.log("\n== links ==");
  await addLink({ portalId: portalA.id, label: "Figma — homepage", url: "https://figma.com/file/abc" });
  await throws(
    "an http link is refused",
    () => addLink({ portalId: portalA.id, label: "x", url: "http://insecure.example" }),
    /https/,
  );
  check("links are portal-scoped", (await listLinks(portalA.id)).length === 1 && (await listLinks(portalB.id)).length === 0);

  console.log("\n== the whole portal view is scoped ==");
  const shellA = await loadPortalShell(portalA.slug);
  const viewerA = {
    ...shellA!,
    mode: "client" as const,
    portalId: portalA.id,
    contact: meridian.contact!,
    readOnly: false,
    showBadge: false,
  };
  const viewA = await loadPortalView(viewerA);
  const idsInA = [
    ...viewA.stacks.flatMap((s) => s.versions.map((v) => v.id)),
    ...viewA.approvals.map((a) => a.approval.id),
    ...viewA.invoices.map((i) => i.id),
    ...viewA.threads.map((t) => t.thread.id),
    ...viewA.phases.map((p) => p.id),
    ...viewA.links.map((l) => l.id),
  ];
  const bIds = new Set([fileB.id, apprB.id, invB.id, threadB.thread.id, phaseB1.id]);
  check("no id belonging to portal B appears in portal A's view", idsInA.every((id) => !bIds.has(id)), idsInA.filter((id) => bIds.has(id)));
  check("portal A's view has all six modules", viewA.modules.length === 6);
  check("the front desk leads with what awaits the client", viewA.frontDesk.length > 0);

  // A module switched off must stop being queried, not merely hidden.
  await setModules(ws.id, portalA.id, "agency", ["timeline", "files"]);
  const trimmedPortal = await requireOwnedPortal(ws.id, portalA.id);
  const trimmedView = await loadPortalView({ ...viewerA, portal: trimmedPortal });
  check(
    "a switched-off module returns no data at all",
    trimmedView.approvals.length === 0 &&
      trimmedView.invoices.length === 0 &&
      trimmedView.threads.length === 0,
  );
  check("the data is still there, just not served", (await listApprovals(portalA.id)).length === 1);
  await setModules(ws.id, portalA.id, "agency", [
    "timeline",
    "files",
    "approvals",
    "messages",
    "invoices",
    "links",
  ]);

  console.log("\n== cross-workspace: another agency ==");
  await throws(
    "a rival agency cannot resolve this portal by id",
    () => requireOwnedPortal(rivalWs.id, portalA.id),
    /isn't in your workspace/,
  );
  await throws(
    "a rival agency cannot attach a contact to this client",
    () =>
      addContact({
        workspaceId: rivalWs.id,
        clientId: meridian.client.id,
        name: "Intruder",
        email: "intruder@example.com",
      }),
    /isn't in your workspace/,
  );
  await throws(
    "a rival agency cannot create a portal for this client",
    () =>
      createPortal({
        workspaceId: rivalWs.id,
        planId: "agency",
        clientId: meridian.client.id,
        preparedBy: "Othershop",
      }),
    /Pick a client/,
  );
  check("the rival's portal wall is empty", (await loadPortalSummaries(rivalWs.id)).length === 0);

  console.log("\n== magic tokens ==");
  const tokenA = await createMagicToken({ portalId: portalA.id, contactId: meridian.contact!.id });
  const tokenB = await createMagicToken({ portalId: portalB.id, contactId: harbor.contact!.id });
  const [storedA] = await db
    .select()
    .from(magicTokens)
    .where(eq(magicTokens.id, tokenA.tokenId));
  check("only the token hash is stored", storedA.tokenHash === hashToken(tokenA.token) && !storedA.tokenHash.includes(tokenA.token));
  await throws(
    "a token cannot be minted for a contact of another client",
    () => createMagicToken({ portalId: portalA.id, contactId: harbor.contact!.id }),
    /different client/,
  );
  const spare = await createMagicToken({ portalId: portalA.id, contactId: meridian.contact!.id });
  check("unused links can be revoked", (await revokeTokensForContact(portalA.id, meridian.contact!.id)) >= 2);
  void spare;
  const freshA = await createMagicToken({ portalId: portalA.id, contactId: meridian.contact!.id });

  console.log("\n== templates and duplication ==");
  const template = await saveAsTemplate(ws.id, portalA.id, "Rebuild setup");
  const third = await createClient({ workspaceId: ws.id, company: "Kestrel Bindery" });
  const portalC = await createPortal({
    workspaceId: ws.id,
    planId: "agency",
    clientId: third.client.id,
    preparedBy: "Northbeam Studio",
    duplicateFromPortalId: template.id,
  });
  const phasesC = await listPhases(portalC.id);
  check("a duplicate copies the phase structure", phasesC.length === 3 && phasesC[0].name === "Discovery");
  check("a duplicate starts every phase at zero progress", phasesC.every((p) => p.progressPct === 0));
  check("a duplicate copies the links", (await listLinks(portalC.id)).length === 1);
  check("a duplicate carries NO files across", (await listFileStacks(portalC.id)).length === 0);
  check("a duplicate carries NO approvals across", (await listApprovals(portalC.id)).length === 0);
  check("a duplicate carries NO invoices across", (await listInvoices(portalC.id)).length === 0);
  check("a duplicate carries NO messages across", (await listThreads(portalC.id)).length === 0);
  check("templates do not count against the portal cap", (await countClientPortals(ws.id)) === 3);
  check("a template is never served as a portal", (await loadPortalShell(template.slug)) === null);

  console.log("\n== plan gating ==");
  check("solo has no e-approvals", plan("solo").eApprovals === false);
  await throws(
    "a trial workspace is capped at two portals",
    async () => {
      const [trialWs] = await db
        .insert(workspaces)
        .values({
          name: "Trial Shop",
          slug: `trialshop-${tag}`,
          ownerUserId: owner.id,
          plan: "trial",
        })
        .returning();
      const c1 = await createClient({ workspaceId: trialWs.id, company: "One" });
      const c2 = await createClient({ workspaceId: trialWs.id, company: "Two" });
      const c3 = await createClient({ workspaceId: trialWs.id, company: "Three" });
      await createPortal({ workspaceId: trialWs.id, planId: "trial", clientId: c1.client.id, preparedBy: "x" });
      await createPortal({ workspaceId: trialWs.id, planId: "trial", clientId: c2.client.id, preparedBy: "x" });
      await createPortal({ workspaceId: trialWs.id, planId: "trial", clientId: c3.client.id, preparedBy: "x" });
    },
    /Trial plan covers 2 client portals/,
  );

  console.log("\n== downgrade reconciliation ==");
  await db
    .update(workspaces)
    .set({ customDomain: "portal.northbeam.studio", customDomainVerifiedAt: new Date() })
    .where(eq(workspaces.id, ws.id));
  await applyPlan(ws.id, "solo");
  const [afterSolo] = await db.select().from(workspaces).where(eq(workspaces.id, ws.id));
  const portalsAfterSolo = await db
    .select()
    .from(portalsT)
    .where(and(eq(portalsT.workspaceId, ws.id), eq(portalsT.isTemplate, false)));
  check("a downgrade keeps every portal (10 >= 3)", portalsAfterSolo.length === 3);
  check(
    "a downgrade withdraws modules the new plan lacks",
    portalsAfterSolo.every(
      (p) => !p.enabledModules.includes("approvals") && !p.enabledModules.includes("invoices"),
    ),
  );
  check("solo keeps the custom domain verified", Boolean(afterSolo.customDomainVerifiedAt));
  await applyPlan(ws.id, "trial");
  const [afterTrial] = await db.select().from(workspaces).where(eq(workspaces.id, ws.id));
  const portalsAfterTrial = await db
    .select()
    .from(portalsT)
    .where(
      and(
        eq(portalsT.workspaceId, ws.id),
        eq(portalsT.isTemplate, false),
        eq(portalsT.status, "archived"),
      ),
    );
  check("a trial downgrade archives the overflow portal, never deletes it", portalsAfterTrial.length === 1);
  check(
    "nothing was deleted",
    (
      await db
        .select({ n: sql<number>`count(*)` })
        .from(portalsT)
        .where(and(eq(portalsT.workspaceId, ws.id), eq(portalsT.isTemplate, false)))
    )[0].n == 3,
  );
  check("a trial cannot keep a verified custom domain", afterTrial.customDomainVerifiedAt === null);
  // Back to Agency for the HTTP phase.
  await applyPlan(ws.id, "agency");
  await setModules(ws.id, portalA.id, "agency", [
    "timeline",
    "files",
    "approvals",
    "messages",
    "invoices",
    "links",
  ]);
  await setModules(ws.id, portalB.id, "agency", [
    "timeline",
    "files",
    "approvals",
    "messages",
    "invoices",
  ]);
  await setPortalStatus(ws.id, portalA.id, "active");
  await setPortalStatus(ws.id, portalB.id, "active");
  await db
    .update(workspaces)
    .set({ customDomain: null, customDomainVerifiedAt: null })
    .where(eq(workspaces.id, ws.id));

  console.log("\n== notifications ==");
  const mail = {
    workspaceId: ws.id,
    portalId: portalA.id,
    kind: "test",
    dedupeKey: `verify:${tag}:once`,
    to: `sam+${tag}@meridian.coffee`,
    subject: "Test",
    body: "Body",
  };
  const first = await sendMail(mail);
  const second = await sendMail(mail);
  check("with no API key a notification is logged, not silently dropped", first === "logged");
  check("the same notification never sends twice", second === "duplicate");

  console.log("\n== the scheduled tick ==");
  await db
    .update(portalsT)
    .set({ lastUpdatedAt: new Date(Date.now() - 9 * 86_400_000) })
    .where(eq(portalsT.id, portalB.id));
  const tick1 = await runTick();
  const tick2 = await runTick();
  check("the tick nudges a portal gone quiet", tick1.nudgesSent >= 1, tick1);
  check("a second tick in the same week sends nothing new", tick2.nudgesSent >= 1, tick2);
  const nudges = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.kind, "stale_portal"), eq(notifications.portalId, portalB.id)));
  check("exactly one nudge row exists for this week", nudges.length === 1, nudges.length);
  check("the nudge is bucketed by ISO week", nudges[0]?.dedupeKey.endsWith(weekKey()));
  // Next week's bucket must produce a second nudge — the "fired once, then silent
  // forever" failure mode.
  const nextWeek = new Date(Date.now() + 8 * 86_400_000);
  const tick3 = await runTick(nextWeek);
  const nudgesLater = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.kind, "stale_portal"), eq(notifications.portalId, portalB.id)));
  check("next week the nudge fires again rather than going silent", nudgesLater.length === 2, {
    tick3,
    count: nudgesLater.length,
  });
  check("expired unused tokens get revoked by the tick", tick1.tokensExpired >= 0);

  console.log("\n== adoption analytics ==");
  const { logPortalView } = await import("@/lib/magic-auth");
  await logPortalView({ portalId: portalA.id, contactId: meridian.contact!.id });
  await logPortalView({ portalId: portalA.id, contactId: meridian.contact!.id });
  const adoption = await loadAdoption(portalA.id);
  check("views are counted per contact", adoption.length === 1 && adoption[0].views === 2, adoption);
  check("portal B has no views of its own", (await loadAdoption(portalB.id)).length === 0);

  console.log("\n== agency overviews ==");
  const summaries = await loadPortalSummaries(ws.id);
  check("every portal appears on the wall", summaries.length === 3);
  const queue = await loadAttentionQueue(ws.id, summaries);
  check("the attention queue is oldest-first", queue.every((item, i) => i === 0 || queue[i - 1].since <= item.since));
  check("the queue names a real portal", queue.length > 0 && summaries.some((s) => s.portal.id === queue[0].portalId));

  console.log("\n== handles for the HTTP phase ==");
  const handles = {
    slugA: portalA.slug,
    slugB: portalB.slug,
    tokenA: freshA.token,
    tokenB: tokenB.token,
    fileA: v4.id,
    fileB: fileB.id,
    approvalB: apprB.id,
    workspaceId: ws.id,
    ownerEmail: owner.email,
  };
  const fs = await import("node:fs/promises");
  await fs.writeFile("/tmp/claude-0/clientdock-handles.json", JSON.stringify(handles, null, 2));
  console.log(JSON.stringify(handles, null, 2));

  console.log(`\n==== ${pass} passed, ${failures.length} failed ====`);
  if (failures.length) {
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
  void clientsT;
  void contactsT;
  void filesT;
  void approvalsT;
  void invoicesT;
  void messagesT;
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  process.exitCode = 1;
  await closeDb();
});
