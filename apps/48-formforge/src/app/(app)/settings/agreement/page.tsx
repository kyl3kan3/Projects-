import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import {
  AGREEMENT_NOTICE,
  AGREEMENT_SECTIONS,
  AGREEMENT_TITLE,
  AGREEMENT_VERSION,
  agreementHash,
  agreementState,
} from "@/lib/agreement";
import { settingsOf } from "@/lib/practices";
import { shortHash, stampLocal } from "@/lib/format";
import { AgreementForm } from "./AgreementForm";
import { IconAlert } from "@/components/icons";

export const metadata: Metadata = { title: "Data protection agreement" };

/**
 * The self-serve agreement flow the MVP list asks for — built as the mechanism, and
 * honest about the paperwork.
 *
 * FormForge is pre-launch: there is no executed Business Associate Agreement to
 * offer and no signed subprocessor chain, so the document presented here says so in
 * its first paragraph and again in section 6. Acceptance is recorded exactly like a
 * patient consent — named signer, timestamp, version, and a hash of the text shown —
 * which is the part that has to be real before any of it means anything.
 */
export default async function AgreementPage() {
  const { practice } = await requireUser();
  const state = agreementState(practice);
  const settings = settingsOf(practice);
  const hash = agreementHash();

  return (
    <main className="screen pt-6" style={{ maxWidth: 680 }}>
      <Link href="/settings" className="btn-quiet mb-4 inline-block">
        Back to settings
      </Link>

      <h1 className="t-h2 mb-1">{AGREEMENT_TITLE}</h1>
      <p className="t-data mb-5" style={{ color: "var(--color-ink-3)" }}>
        VERSION {AGREEMENT_VERSION.toUpperCase()} · SHA-256 {shortHash(hash)}
      </p>

      <div className="panel mb-6 p-4">
        <p className="t-title mb-2 flex items-start gap-2" style={{ color: "var(--color-clay)" }}>
          <IconAlert size={18} />
          Read this first
        </p>
        <p className="t-body">{AGREEMENT_NOTICE}</p>
      </div>

      <div className="consent-frame mb-6" style={{ maxHeight: "56vh" }} tabIndex={0}>
        {AGREEMENT_SECTIONS.map((section) => (
          <section key={section.heading} className="mb-6">
            <h2 className="t-title mb-2">{section.heading}</h2>
            <p className="t-body">{section.body}</p>
          </section>
        ))}
      </div>

      {state.accepted && !state.stale ? (
        <div className="panel p-4">
          <p className="t-secondary">
            Accepted by {state.signerName} on {stampLocal(state.acceptedAt!, settings.timeZone)} —
            version {state.version}. That acceptance is in the audit log and cannot be edited.
          </p>
        </div>
      ) : (
        <AgreementForm stale={state.stale} previousSigner={state.signerName} />
      )}
    </main>
  );
}
