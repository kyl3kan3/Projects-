import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { orgs } from "@/db/schema";
import { certificatesForVendor } from "@/lib/certificates";
import { formatDate } from "@/lib/dates";
import { engagementViews, expectedHolder } from "@/lib/verdicts";
import { vendorForToken } from "@/lib/tokens";
import { summariseTemplate } from "@/lib/requirements";
import { IconShield } from "@/components/icons";
import { UploadForm } from "./UploadForm";

export const metadata: Metadata = {
  title: "Upload your certificate of insurance",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The vendor upload portal (DESIGN.md screen 6). Mobile-first at 390px — an agent's
 * assistant uploads this from a phone — and it tells them exactly what is required
 * before they upload, which is the difference between one round trip and four.
 *
 * A dead link is a dead end for the person holding it, so it says what to do rather
 * than 404ing.
 */
export default async function VendorUploadPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const vendor = await vendorForToken(token);

  if (!vendor) {
    return (
      <main
        style={{
          maxWidth: 440,
          margin: "0 auto",
          padding: "40px var(--gutter)",
        }}
      >
        <h1 className="t-h2">This link is no longer valid</h1>
        <p className="t-body" style={{ marginTop: 12 }}>
          Upload links are replaced whenever a new renewal request goes out, so an older email will
          have stopped working. The most recent email you received has a link that works.
        </p>
        <p className="t-secondary" style={{ marginTop: 16 }}>
          If you cannot find it, reply to whoever asked you for the certificate and ask for a fresh
          link — it takes them one click.
        </p>
      </main>
    );
  }

  const db = getDb();
  const [org] = await db.select().from(orgs).where(eq(orgs.id, vendor.orgId));
  const views = org ? await engagementViews(org, { vendorId: vendor.id }) : [];
  const certificates = await certificatesForVendor(vendor.id);
  const latest = certificates[0] ?? null;
  const requirements = [...new Set(views.map((v) => summariseTemplate(v.template)))];
  const properties = views.map((v) => v.property.name);
  const soonest = views
    .map((v) => v.verdict.soonestExpiry)
    .filter((d): d is string => Boolean(d))
    .sort()[0];

  return (
    <main style={{ maxWidth: 440, margin: "0 auto", padding: "32px var(--gutter) 56px" }}>
      <div className="flex items-center" style={{ gap: 8 }}>
        <span style={{ color: "var(--color-seal)" }}>
          <IconShield size={20} />
        </span>
        <span className="t-label">{org?.name ?? "Certificate intake"}</span>
      </div>

      <h1 className="t-display" style={{ marginTop: 12 }}>
        Upload the certificate for {vendor.name}
      </h1>
      <p className="t-body" style={{ marginTop: 12 }}>
        {properties.length
          ? `${org?.name ?? "The certificate holder"} needs current insurance on file for ${
              properties.length === 1
                ? properties[0]
                : `${properties.slice(0, -1).join(", ")} and ${properties[properties.length - 1]}`
            }.`
          : `${org?.name ?? "The certificate holder"} needs current insurance on file for ${vendor.name}.`}
        {soonest ? ` The coverage we have runs to ${formatDate(soonest)}.` : ""}
      </p>

      {requirements.length > 0 && (
        <section className="panel" style={{ marginTop: 24, padding: 16 }}>
          <h2 className="t-label">What has to be on it</h2>
          {requirements.map((requirement, i) => (
            <p key={i} className="t-secondary" style={{ marginTop: 8 }}>
              {requirement}
            </p>
          ))}
          <p className="t-secondary" style={{ marginTop: 12 }}>
            The certificate holder box must read <strong>{org ? expectedHolder(org) : ""}</strong>.
          </p>
        </section>
      )}

      <UploadForm token={token} orgName={org?.name ?? "the certificate holder"} />

      {latest && (
        <section style={{ marginTop: 32 }}>
          <h2 className="t-label">Last certificate we received</h2>
          <p className="t-secondary" style={{ marginTop: 6 }}>
            {latest.carrier ? `${latest.carrier} · ` : ""}
            uploaded {formatDate(latest.uploadedAt.toISOString().slice(0, 10))}
            {latest.parsedStatus === "needs_review" ? " · under review" : ""}
            {latest.parsedStatus === "failed" ? " · being entered by hand" : ""}
          </p>
        </section>
      )}

      <p className="t-secondary" style={{ marginTop: 32 }}>
        Questions about what is required? Reply to the email that sent you here — a person reads it.
      </p>
    </main>
  );
}
