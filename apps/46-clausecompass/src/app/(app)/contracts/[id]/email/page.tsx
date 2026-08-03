import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { assembleReport, getContract } from "@/lib/contracts";
import { buildRequestedChangesEmail, draftSubject } from "@/lib/email-draft";
import { EmailDraft } from "./EmailDraft";

export const metadata: Metadata = { title: "Requested changes" };

/**
 * The draft email: the accepted redlines, assembled into something sendable.
 *
 * Built on the server from the accepted redlines so the text is identical to what the
 * report says, then handed to a client component for editing. The reminder above the box is
 * deliberate — this is the one artefact that leaves the product and lands in someone
 * else's inbox under the reader's name.
 */
export default async function EmailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, account } = await requireUser();
  const contract = await getContract(account.id, id);
  if (!contract) notFound();
  const view = await assembleReport(contract);

  const asks = view.rows
    .flatMap((row) =>
      row.flags
        .filter((f) => f.redline?.accepted)
        .map((f) => ({
          clauseLabel: row.label,
          citation: row.citation,
          severity: f.flag.severity,
          emailSnippet: f.redline!.emailSnippet,
          suggestedText: f.redline!.suggestedText,
        })),
    )
    .filter(Boolean);

  const body = buildRequestedChangesEmail({
    contractTitle: contract.title,
    counterparty: contract.counterparty,
    senderName: user.name,
    asks,
  });

  return (
    <main className="screen">
      <header className="pt-8">
        <p className="t-label">Requested changes</p>
        <h1 className="t-h2 mt-2">{contract.title}</h1>
        <p className="t-secondary mt-2">
          {asks.length === 0
            ? "No redlines are marked for the email yet. Open a flag in the report and tap “Add to email”."
            : `${asks.length} ${asks.length === 1 ? "ask" : "asks"}, worst first. Edit anything you like — you are the one sending it.`}
        </p>
      </header>

      <EmailDraft subject={draftSubject(contract.title)} body={body} />

      <p className="t-secondary mt-8">
        <Link href={`/contracts/${contract.id}`} className="btn-quiet btn-quiet-sm">
          Back to the report
        </Link>
      </p>
    </main>
  );
}
