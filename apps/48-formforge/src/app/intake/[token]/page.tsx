import type { Metadata } from "next";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  blockFields,
  blockHeading,
  consentParagraphs,
  safeConfig,
  sections,
  validateBlockAnswers,
  type Field,
} from "@/lib/blocks";
import { screenerDefinition } from "@/lib/screeners";
import {
  loadAnswersForPatient,
  markStarted,
  resolveIntakeToken,
  signaturesFor,
  type ResolvedIntake,
} from "@/lib/intakes";
import { evidenceSummary } from "@/lib/signature";
import { readPhi } from "@/lib/phi";
import { clientIp } from "@/lib/request";
import { SignaturePad } from "@/components/SignaturePad";
import { SignatureBlock } from "@/components/SignatureBlock";
import { IconAlert, IconCheck, IconLock } from "@/components/icons";
import { saveSectionAction } from "./actions";

/** A patient link must never be indexed, cached, or previewed by a crawler. */
export const metadata: Metadata = {
  title: "Your forms",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

const SIG_MESSAGES: Record<string, string> = {
  disclosure: "Tick the box above the signature to confirm you agree to sign electronically.",
  name: "Type your full name — first and last — above the signature line.",
  draw: "That looked like a tap rather than a signature. Draw your name in the box.",
  typed: "This consent accepts a typed signature only.",
  already: "That consent is already signed — nothing was changed.",
  unknown: "Something about the signature did not go through. Please try again.",
};

/**
 * The patient packet — FormForge's most important surface (DESIGN.md "Patient
 * packet"). No chrome but a wordmark, the progress bar, and one section per screen.
 *
 * It is deliberately **server-rendered with plain form posts**: a stressed person
 * on an old phone with a bad connection must be able to finish this, so the only
 * JavaScript on the critical path is the optional drawn-signature pad. Each
 * Continue saves the section, which is what makes save-and-resume survive a
 * browser being killed mid-packet.
 *
 * A dead or unknown link gets one calm sentence and no practice details — the
 * page does not distinguish a wrong token from an expired one for a stranger, and it
 * does not try.
 */
export default async function IntakePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ s?: string; done?: string; err?: string; sig?: string; upload?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;

  const result = await resolveIntakeToken(token);
  if (!result.ok) return <DeadLink />;
  const resolved = result.value;

  const ip = await clientIp();
  const [answers, signed] = await Promise.all([
    loadAnswersForPatient(resolved, ip),
    signaturesFor(resolved.intake.id),
  ]);

  const all = sections(resolved.version.blocks);
  const done = query.done === "1" || resolved.intake.status === "signed" || resolved.intake.status === "completed";

  if (done) {
    return <FinishedScreen resolved={resolved} signedCount={signed.length} />;
  }

  await markStarted(resolved.intake, ip);

  const requested = Number.parseInt(query.s ?? "", 10);
  const index = Number.isInteger(requested)
    ? Math.max(0, Math.min(requested, all.length - 1))
    : Math.min(resolved.intake.sectionIndex, all.length - 1);
  const section = all[index];

  const problems =
    query.err === "1" ? section.blocks.flatMap((b) => validateBlockAnswers(b, answers)) : [];
  const sigProblem = query.sig ? (SIG_MESSAGES[query.sig] ?? SIG_MESSAGES.unknown) : null;
  const uploadProblem = query.upload ?? null;

  const consentBlock = section.blocks.find((b) => b.kind === "consent");
  const signatureBlock = section.blocks.find((b) => b.kind === "signature");
  const signatureConfig = signatureBlock ? safeConfig("signature", signatureBlock.config) : null;
  const alreadySigned = signatureBlock
    ? signed.some((s) => s.blockKey === signatureBlock.key)
    : false;

  const nameGuess = [answers["demographics.first_name"], answers["demographics.last_name"]]
    .filter(Boolean)
    .join(" ");

  return (
    <div style={{ minHeight: "100dvh" }}>
      <header className="hairline-b px-5 pb-3 pt-4">
        <p className="t-label" style={{ color: "var(--color-ink-2)" }}>
          {resolved.practice.name}
        </p>
      </header>
      <div className="progress" role="progressbar" aria-valuemin={1} aria-valuemax={all.length} aria-valuenow={index + 1}>
        <div className="progress-fill" style={{ width: `${((index + 1) / all.length) * 100}%` }} />
      </div>

      <main className="section-enter px-5 pb-16 pt-6" style={{ maxWidth: 640, margin: "0 auto" }}>
        <p className="t-data mb-2" style={{ color: "var(--color-ink-3)" }}>
          SECTION {index + 1} OF {all.length}
        </p>
        <h1 className="t-h2 mb-2">{section.title}</h1>
        {index === 0 && (
          <p className="t-secondary mb-6">
            Your answers save each time you continue, so you can stop and come back to this same
            link. It should take about ten minutes.
          </p>
        )}

        {problems.length > 0 && (
          <div className="panel mb-6 p-4" role="alert">
            <p className="t-title mb-2" style={{ color: "var(--color-clay)" }}>
              A few things still need an answer
            </p>
            <ul className="m-0 list-none p-0">
              {problems.map((p, i) => (
                <li key={i} className="t-secondary" style={{ color: "var(--color-clay)" }}>
                  {p}
                </li>
              ))}
            </ul>
          </div>
        )}
        {sigProblem && (
          <p
            className="mb-6 flex items-start gap-2 text-[15px] leading-[1.5]"
            style={{ color: "var(--color-clay)" }}
            role="alert"
          >
            <IconAlert size={20} />
            <span>{sigProblem}</span>
          </p>
        )}
        {uploadProblem && (
          <p
            className="mb-6 flex items-start gap-2 text-[15px] leading-[1.5]"
            style={{ color: "var(--color-clay)" }}
            role="alert"
          >
            <IconAlert size={20} />
            <span>{uploadProblem}</span>
          </p>
        )}

        <form action={saveSectionAction} encType="multipart/form-data">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="section" value={index} />

          {section.blocks.map((block) => {
            if (block.kind === "consent") {
              const cfg = safeConfig("consent", block.config);
              return (
                <section key={block.key} className="mb-8">
                  <div className="consent-frame" tabIndex={0}>
                    {consentParagraphs(block).map((paragraph, i) => (
                      <p key={i} className="t-body" style={{ marginBottom: 16 }}>
                        {paragraph}
                      </p>
                    ))}
                  </div>
                  {cfg?.requireScroll && (
                    <p className="field-help mt-2">Scroll to the end before signing.</p>
                  )}
                </section>
              );
            }

            if (block.kind === "signature") return null;

            if (block.kind === "screener") {
              const cfg = safeConfig("screener", block.config);
              const def = cfg ? screenerDefinition(cfg.instrument) : null;
              if (!def) return null;
              return (
                <section key={block.key} className="mb-8">
                  <p className="t-body mb-6">{def.prompt}</p>
                  {def.items.map((item, i) => {
                    const name = `${block.key}.i${i + 1}`;
                    const current = answers[name];
                    return (
                      <fieldset
                        key={name}
                        className="mb-8"
                        style={{ border: "none", padding: 0, margin: "0 0 32px" }}
                      >
                        <legend className="t-body" style={{ padding: 0, marginBottom: 8 }}>
                          {i + 1}. {item}
                        </legend>
                        {def.options.map((option) => (
                          <label className="choice" key={option.value}>
                            <input
                              type="radio"
                              name={name}
                              value={String(option.value)}
                              defaultChecked={current === String(option.value)}
                              required
                            />
                            <span className="choice-label">{option.label}</span>
                            <span className="choice-value">{option.value}</span>
                          </label>
                        ))}
                      </fieldset>
                    );
                  })}
                  <p className="t-secondary" style={{ color: "var(--color-ink-3)" }}>
                    {def.attribution}
                  </p>
                </section>
              );
            }

            const cfg = block.kind === "history" ? safeConfig("history", block.config) : null;
            return (
              <section key={block.key} className="mb-4">
                {block.kind !== "demographics" && blockHeading(block) !== section.title && (
                  <h2 className="t-title mb-3">{blockHeading(block)}</h2>
                )}
                {cfg?.intro && <p className="t-body mb-6">{cfg.intro}</p>}
                {blockFields(block).map((field) => (
                  <FieldControl key={field.name} field={field} value={answers[field.name] ?? ""} />
                ))}
              </section>
            );
          })}

          {signatureBlock && signatureConfig && !alreadySigned && (
            <section className="mb-8">
              <h2 className="t-title mb-1">{signatureConfig.heading}</h2>
              <p className="t-secondary mb-5">
                Signing records the exact text above, the time, your IP address, and a SHA-256 hash
                of what you agreed to. Editing this form later cannot change any of that.
              </p>
              <SignaturePad
                allowDrawn={signatureConfig.allowDrawn}
                defaultName={nameGuess}
                disclosure={signatureConfig.disclosure}
              />
            </section>
          )}

          {alreadySigned && (
            <p className="t-secondary mb-8" style={{ color: "var(--color-moss)" }}>
              You have already signed this consent. Continue to the next section.
            </p>
          )}

          <button className="btn btn-primary btn-full" type="submit">
            {index + 1 === all.length ? "Finish and submit" : "Save and continue"}
          </button>
        </form>

        {index > 0 && (
          <a
            className="btn-quiet mt-5 inline-block"
            href={`/intake/${token}?s=${index - 1}`}
          >
            Back a section
          </a>
        )}

        <p
          className="t-secondary mt-10 flex items-start gap-2"
          style={{ color: "var(--color-ink-3)" }}
        >
          <IconLock size={18} />
          <span>
            Your answers are encrypted before they are stored, and {resolved.practice.name} can see
            who opened them and when. This link is private to you — please do not forward it.
          </span>
        </p>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ fields */

function FieldControl({ field, value }: { field: Field; value: string }) {
  if (field.kind === "long_text") {
    return (
      <label className="field">
        <span className="field-label">
          {field.label}
          {field.required ? " *" : ""}
        </span>
        <textarea
          className="input"
          name={field.name}
          defaultValue={value}
          required={field.required}
          rows={4}
        />
        {field.help && <span className="field-help">{field.help}</span>}
      </label>
    );
  }

  if (field.kind === "yes_no") {
    return (
      <fieldset className="field" style={{ border: "none", padding: 0 }}>
        <legend className="field-label" style={{ padding: 0 }}>
          {field.label}
          {field.required ? " *" : ""}
        </legend>
        {["yes", "no"].map((option) => (
          <label className="choice" key={option}>
            <input
              type="radio"
              name={field.name}
              value={option}
              defaultChecked={value.toLowerCase() === option}
              required={field.required}
            />
            <span className="choice-label">{option === "yes" ? "Yes" : "No"}</span>
          </label>
        ))}
        {field.help && <p className="field-help">{field.help}</p>}
      </fieldset>
    );
  }

  if (field.kind === "file") {
    return (
      <label className="field">
        <span className="field-label">
          {field.label}
          {field.required ? " *" : ""}
        </span>
        <input
          className="input"
          style={{ paddingTop: 12, height: "auto" }}
          type="file"
          name={field.name}
          accept="image/jpeg,image/png,application/pdf"
        />
        {field.help && <span className="field-help">{field.help}</span>}
      </label>
    );
  }

  const type =
    field.kind === "email"
      ? "email"
      : field.kind === "phone"
        ? "tel"
        : field.kind === "date"
          ? "date"
          : "text";

  return (
    <label className="field">
      <span className="field-label">
        {field.label}
        {field.required ? " *" : ""}
      </span>
      <input
        className={`input${field.kind === "date" || field.kind === "phone" ? " input-mono" : ""}`}
        type={type}
        inputMode={field.kind === "email" ? "email" : field.kind === "phone" ? "tel" : undefined}
        autoCapitalize={field.kind === "email" ? "none" : undefined}
        name={field.name}
        defaultValue={value}
        required={field.required}
      />
      {field.help && <span className="field-help">{field.help}</span>}
    </label>
  );
}

/* ------------------------------------------------------------------ states */

function DeadLink() {
  return (
    <main className="px-5 pt-16" style={{ maxWidth: 480, margin: "0 auto" }}>
      <h1 className="t-h2 mb-3">This link is no longer active</h1>
      <p className="t-body mb-6">
        Intake links expire, and each one can be replaced by a newer one. Contact your practice and
        ask them to send a fresh link — nothing you filled in has been lost.
      </p>
      <p className="t-secondary" style={{ color: "var(--color-ink-3)" }}>
        For your privacy this page will not say which practice sent the original link.
      </p>
    </main>
  );
}

async function FinishedScreen({
  resolved,
  signedCount,
}: {
  resolved: ResolvedIntake;
  signedCount: number;
}) {
  const db = getDb();
  const staff = resolved.intake.assignedUserId
    ? await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, resolved.intake.assignedUserId))
    : [];
  const clinician = staff[0]?.name ?? resolved.practice.name;

  // The last signature, replayed once with its stamp — DESIGN.md's signature detail.
  const records = await signaturesFor(resolved.intake.id);
  const last = records[records.length - 1];
  const stamp = last
    ? await readPhi(
        resolved.practice,
        { type: "patient", id: resolved.intake.id, label: "patient (own packet)" },
        { targetType: "signature", targetId: last.id, targetLabel: "signature stamp" },
        (unseal) => ({
          signedName: unseal(last.signedNameEnc) ?? "",
          payload: unseal(last.signaturePayloadEnc) ?? "",
        }),
      )
    : null;

  return (
    <main className="px-5 pt-16" style={{ maxWidth: 560, margin: "0 auto" }}>
      <p style={{ color: "var(--color-moss)" }}>
        <IconCheck size={32} />
      </p>
      <h1 className="t-h2 mb-2 mt-3">You&apos;re all set</h1>
      <p className="t-body mb-8">
        {clinician} has your packet. {signedCount === 1 ? "Your signature is" : "Your signatures are"}{" "}
        on file with the exact text you agreed to.
      </p>

      {last && stamp && (
        <div className="panel p-4">
          <SignatureBlock
            kind={last.kind}
            payload={stamp.payload}
            signedName={stamp.signedName}
            monoLine={evidenceSummary(last, stamp.signedName).monoLine}
            replay
          />
        </div>
      )}

      <p className="t-secondary mt-8" style={{ color: "var(--color-ink-3)" }}>
        You can close this page. If you need a copy of what you signed, ask the practice — they can
        send you the PDF, and that request is recorded too.
      </p>
    </main>
  );
}
