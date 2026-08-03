import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { certificatesForVendor, coveragesFor } from "@/lib/certificates";
import { chasesForEngagements } from "@/lib/chasing";
import { formatDate, formatStamp, relativeDays } from "@/lib/dates";
import { formatCents } from "@/lib/format";
import { CHASE_LABEL } from "@/lib/ladder";
import { summariseTemplate, listTemplates } from "@/lib/requirements";
import { TRADES } from "@/lib/requirement-presets";
import { engagementViews } from "@/lib/verdicts";
import { listProperties, vendorById } from "@/lib/vendors";
import { DeficiencyList } from "@/components/DeficiencyList";
import { VerdictPlacard } from "@/components/VerdictPlacard";
import { IconDownload } from "@/components/icons";
import {
  AddEngagementForm,
  EditVendorForm,
  EndEngagementButton,
  UploadLinkPanel,
} from "./VendorForms";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { org } = await requireUser();
  const vendor = await vendorById(org.id, (await params).id);
  return { title: vendor?.name ?? "Vendor" };
}

const PARSED_LABEL: Record<string, string> = {
  pending: "Waiting to be read",
  parsed: "Parsed",
  needs_review: "Needs review",
  failed: "Could not be read",
};

/**
 * Vendor detail (DESIGN.md screen 3): engagements with per-property verdicts and
 * their deficiency sentences, the immutable certificate history with hashes, and the
 * chase timeline — what was sent, when, to whom.
 */
export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { org } = await requireUser();
  const { id } = await params;
  const vendor = await vendorById(org.id, id);
  if (!vendor) notFound();

  const [views, certificates, properties, templates] = await Promise.all([
    engagementViews(org, { vendorId: vendor.id, includeEnded: true }),
    certificatesForVendor(vendor.id),
    listProperties(org.id),
    listTemplates(org.id),
  ]);
  const active = views.filter((v) => v.engagement.status === "active");
  const chases = await chasesForEngagements(views.map((v) => v.engagement.id));
  const propertyById = new Map(views.map((v) => [v.engagement.id, v.property.name]));

  const currentCertificate = views.find((v) => v.certificate)?.certificate ?? null;
  const currentCoverages = currentCertificate ? await coveragesFor(currentCertificate.id) : [];
  const engagedPropertyIds = new Set(active.map((v) => v.property.id));
  const availableProperties = properties.filter((p) => !engagedPropertyIds.has(p.id));

  return (
    <main style={{ padding: "24px var(--gutter) 0" }}>
      <Link href="/vendors" className="btn-quiet">
        All vendors
      </Link>
      <h1 className="t-display" style={{ marginTop: 12 }}>
        {vendor.name}
      </h1>
      <p className="t-secondary" style={{ marginTop: 6 }}>
        {[
          vendor.trade,
          vendor.status === "inactive" ? "Inactive — never chased" : null,
          vendor.contactEmail,
          vendor.agentEmail ? `agent ${vendor.agentEmail}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {vendor.notes && (
        <p className="t-body" style={{ marginTop: 12, maxWidth: "62ch" }}>
          {vendor.notes}
        </p>
      )}

      {/* Engagements: one verdict per property, each with its own sentences. */}
      <section style={{ marginTop: 32 }}>
        <h2 className="t-h2">Engagements</h2>
        {active.length === 0 && (
          <p className="t-secondary" style={{ marginTop: 8, maxWidth: "62ch" }}>
            This vendor is not attached to any property or project, so nothing is being checked. Add
            an engagement below.
          </p>
        )}
        {active.map((view, i) => (
          <article key={view.engagement.id} className="hairline-b" style={{ padding: "16px 0" }}>
            <div className="flex items-baseline justify-between" style={{ gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <Link
                  href={`/properties/${view.property.id}`}
                  className="t-title no-underline"
                  style={{ color: "var(--color-ink)" }}
                >
                  {view.property.name}
                </Link>
                <p className="t-secondary" style={{ marginTop: 2 }}>
                  Held to{" "}
                  <Link href={`/requirements/${view.template.id}`} className="btn-quiet">
                    {view.template.name}
                  </Link>
                </p>
              </div>
              {/* The seal presses on this render — a verdict flipping to compliant. */}
              <VerdictPlacard status={view.verdict.status} press={i === 0} />
            </div>

            {view.verdict.soonestExpiry && (
              <p className="t-mono" style={{ marginTop: 8, color: "var(--color-dim)" }}>
                Coverage runs to {formatDate(view.verdict.soonestExpiry)} ·{" "}
                {relativeDays(view.verdict.daysToExpiry ?? 0)}
              </p>
            )}

            <DeficiencyList deficiencies={view.verdict.deficiencies} className="mt-3" />

            <p className="t-secondary" style={{ marginTop: 10 }}>
              {summariseTemplate(view.template)}
            </p>
            <div style={{ marginTop: 10 }}>
              <EndEngagementButton vendorId={vendor.id} engagementId={view.engagement.id} />
            </div>
          </article>
        ))}

        <details style={{ marginTop: 16 }}>
          <summary className="btn-quiet" style={{ minHeight: 44, display: "flex", alignItems: "center" }}>
            Add an engagement
          </summary>
          <AddEngagementForm
            vendorId={vendor.id}
            properties={availableProperties.map((p) => ({ id: p.id, name: p.name, kind: p.kind }))}
            templates={templates.map((t) => ({ id: t.id, name: t.name }))}
            defaultTemplateId={org.settings?.defaultTemplateId ?? null}
          />
        </details>
      </section>

      {/* The current coverage, as parsed. */}
      {currentCertificate && currentCoverages.length > 0 && (
        <section style={{ marginTop: 32 }}>
          <h2 className="t-h2">Coverage on file</h2>
          <p className="t-secondary" style={{ marginTop: 4 }}>
            From the certificate uploaded {formatStamp(currentCertificate.uploadedAt, org.timezone)}
            {currentCertificate.reviewedAt ? ", confirmed by a reviewer" : ""}.
          </p>
          <div className="matrix-wrap" style={{ marginTop: 12 }}>
            <table className="matrix">
              <thead>
                <tr>
                  <th scope="col">Coverage</th>
                  <th scope="col">Limit</th>
                  <th scope="col">Policy</th>
                  <th scope="col">Effective</th>
                  <th scope="col">Expires</th>
                  <th scope="col">AI</th>
                  <th scope="col">WOS</th>
                </tr>
              </thead>
              <tbody>
                {currentCoverages.map((coverage) => (
                  <tr key={coverage.id}>
                    <td>{coverage.label}</td>
                    <td className="num">{formatCents(coverage.limitCents)}</td>
                    <td className="num">{coverage.policyNumber ?? "—"}</td>
                    <td className="num">{formatDate(coverage.effectiveOn)}</td>
                    <td className="num">{formatDate(coverage.expiresOn)}</td>
                    <td className="num">
                      {coverage.additionalInsured === null
                        ? "—"
                        : coverage.additionalInsured
                          ? "Yes"
                          : "No"}
                    </td>
                    <td className="num">
                      {coverage.waiverOfSubrogation === null
                        ? "—"
                        : coverage.waiverOfSubrogation
                          ? "Yes"
                          : "No"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Immutable evidence. */}
      <section style={{ marginTop: 32 }}>
        <h2 className="t-h2">Certificates on file</h2>
        <p className="t-secondary" style={{ marginTop: 4, maxWidth: "62ch" }}>
          Every upload is kept exactly as it arrived, hashed. A replacement is a new row — nothing is
          ever overwritten.
        </p>
        {certificates.length === 0 ? (
          <p className="t-secondary" style={{ marginTop: 12 }}>
            Nothing has been uploaded yet. Send the upload link below, or forward the certificate to
            your intake address.
          </p>
        ) : (
          <div style={{ marginTop: 12 }}>
            {certificates.map((certificate) => (
              <div key={certificate.id} className="row" style={{ alignItems: "flex-start" }}>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span className="t-title" style={{ display: "block" }}>
                    {certificate.carrier ?? "Carrier not read"}
                  </span>
                  <span className="t-secondary" style={{ display: "block" }}>
                    {PARSED_LABEL[certificate.parsedStatus]} ·{" "}
                    {formatStamp(certificate.uploadedAt, org.timezone)} · via {certificate.source}
                  </span>
                  <span
                    className="t-mono"
                    style={{ display: "block", marginTop: 4, color: "var(--color-dim)", wordBreak: "break-all" }}
                  >
                    sha256 {certificate.sha256}
                  </span>
                  {certificate.parseError && (
                    <span className="deficiency" style={{ display: "block", marginTop: 6 }}>
                      {certificate.parseError}
                    </span>
                  )}
                  {certificate.parsedStatus === "needs_review" && (
                    <Link href="/review" className="btn-quiet" style={{ marginTop: 6 }}>
                      Review it now
                    </Link>
                  )}
                </span>
                <a
                  href={`/api/certificates/${certificate.id}/pdf`}
                  className="btn btn-secondary"
                  style={{ flex: "none" }}
                  target="_blank"
                  rel="noreferrer"
                >
                  <IconDownload size={18} />
                  PDF
                </a>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* The chase timeline. */}
      <section style={{ marginTop: 32 }}>
        <h2 className="t-h2">Chase timeline</h2>
        {chases.length === 0 ? (
          <p className="t-secondary" style={{ marginTop: 8, maxWidth: "62ch" }}>
            Nothing has been sent yet. Renewal requests fire 30, 14, 7 and 1 day before expiry, a
            lapse notice once after, and a deficiency letter naming each gap — each exactly once per
            renewal cycle.
          </p>
        ) : (
          <div style={{ marginTop: 8 }}>
            {chases.map((chase) => (
              <div key={chase.id} className="timeline-row">
                <span>{formatStamp(chase.sentAt, org.timezone)}</span>
                <span className="timeline-verb">{CHASE_LABEL[chase.kind]}</span>
                <span>{propertyById.get(chase.engagementId) ?? "engagement"}</span>
                <span>to {chase.sentTo.join(", ")}</span>
                <span>cycle {chase.expiryCycle}</span>
                {!chase.providerMessageId && <span>delivery not confirmed</span>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* The link and the details, both below the fold on a phone. */}
      <section style={{ marginTop: 32 }}>
        <h2 className="t-h2">Upload link</h2>
        <p className="t-secondary" style={{ marginTop: 4, maxWidth: "62ch" }}>
          Send this to the vendor or their agent. No account, no password — they open it and drop the
          PDF.
        </p>
        <UploadLinkPanel vendorId={vendor.id} currentUrl={null} />
      </section>

      <section style={{ marginTop: 32 }}>
        <details>
          <summary
            className="btn-quiet"
            style={{ minHeight: 44, display: "flex", alignItems: "center" }}
          >
            Edit vendor details
          </summary>
          <div style={{ marginTop: 16 }}>
            <EditVendorForm
              vendor={{
                id: vendor.id,
                name: vendor.name,
                trade: vendor.trade,
                contactName: vendor.contactName,
                contactEmail: vendor.contactEmail,
                agentName: vendor.agentName,
                agentEmail: vendor.agentEmail,
                phone: vendor.phone,
                notes: vendor.notes,
                status: vendor.status,
              }}
              trades={TRADES}
            />
          </div>
        </details>
      </section>
    </main>
  );
}
