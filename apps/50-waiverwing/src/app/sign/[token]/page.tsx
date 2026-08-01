import type { Metadata } from "next";
import { resolveSignToken } from "@/lib/qr";
import { expiryRuleLabel, signatureConfig } from "@/lib/waivers";
import { SignFlow } from "@/components/SignFlow";
import { Blaze } from "@/components/Blaze";

export const metadata: Metadata = {
  title: "Sign your waiver",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * The customer-facing signing flow. QR posters, emailed pre-arrival links and
 * re-sign links all land here.
 *
 * The waiver text is rendered on the server and handed to the flow as data —
 * nothing about the document is fetched from the browser, so a phone on one bar
 * in a queue still gets the whole agreement in the first response.
 *
 * A dead token gets a calm dead-end that leaks nothing about the venue. The only
 * useful instruction at that point is "ask the front desk".
 */
export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveSignToken(token);

  if (resolved.kind !== "ok") {
    const message =
      resolved.kind === "expired"
        ? "That link has expired."
        : resolved.kind === "no_live_waiver"
          ? "There is no waiver ready to sign here yet."
          : "That code is not in use any more.";
    const detail =
      resolved.kind === "no_live_waiver"
        ? "Ask a member of staff — they will have a code that works."
        : "Posters get replaced from time to time. Ask the front desk for the current code and you will be signed in a minute.";

    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col justify-center px-5 py-10">
        <Blaze size={40} draw={false} />
        <h1 className="t-h2 mt-6">{message}</h1>
        <p className="t-body mt-3" style={{ color: "var(--color-text-2)" }}>
          {detail}
        </p>
      </main>
    );
  }

  const { location, version } = resolved;
  const sigConfig = signatureConfig(version.bodyBlocks);

  return (
    <main className="mx-auto w-full max-w-[640px] pb-16">
      <SignFlow
        token={token}
        versionId={version.id}
        venueName={location.name}
        waiverTitle={version.title}
        waiverVersion={version.version}
        blocks={version.bodyBlocks}
        disclosure={sigConfig.disclosure}
        allowDrawn={sigConfig.allowDrawn}
        ageOfMajority={version.minorRule.ageOfMajority}
        relationshipOptions={version.minorRule.relationshipOptions}
        expiryLabel={expiryRuleLabel(version.expiryRule)}
        channel={resolved.source === "link" ? "link" : "qr"}
      />
      <noscript>
        <p className="t-secondary px-5">
          This form needs JavaScript to capture a signature. Ask the front desk and they will take
          the waiver on the counter tablet.
        </p>
      </noscript>
    </main>
  );
}
