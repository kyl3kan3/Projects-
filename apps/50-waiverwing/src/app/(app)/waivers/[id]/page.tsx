import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { signatures, waivers } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { listVersions, renderVersionText, shortHash } from "@/lib/waivers";
import { TEMPLATE_DISCLAIMER } from "@/lib/templates";
import { WaiverEditor } from "./WaiverEditor";

export const metadata: Metadata = { title: "Waiver" };
export const dynamic = "force-dynamic";

export default async function WaiverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { account, location } = await requireUser();
  const db = getDb();

  const [waiver] = await db
    .select()
    .from(waivers)
    .where(and(eq(waivers.id, id), eq(waivers.accountId, account.id)));
  if (!waiver) notFound();

  const versions = await listVersions(waiver.id);
  const [signed] = await db
    .select({ n: count() })
    .from(signatures)
    .where(eq(signatures.waiverId, waiver.id));
  const signatureCount = Number(signed?.n ?? 0);

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: location.timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="px-5 lg:px-0">
      <div className="pt-6">
        <Link href="/waivers" className="btn-quiet">
          All waivers
        </Link>
      </div>

      <h1 className="t-h2 mt-4">{waiver.title}</h1>
      <p className="t-data mt-1.5" style={{ color: "var(--color-text-2)" }}>
        {versions.length
          ? `V${versions[0].version} · PUBLISHED ${fmt.format(versions[0].publishedAt).toUpperCase()} · ${signatureCount} SIGNED`
          : "DRAFT · NEVER PUBLISHED"}
      </p>

      {versions.length ? (
        <p className="t-secondary mt-3">
          Customers can sign this now at{" "}
          <Link href={`/sign/${location.qrToken}`} className="btn-quiet">
            /sign/{location.qrToken.slice(0, 6)}…
          </Link>
        </p>
      ) : (
        <p className="t-secondary mt-3">
          Nothing can be signed until you publish version 1.
        </p>
      )}

      <p className="t-secondary mt-4">{TEMPLATE_DISCLAIMER}</p>

      <div className="mt-8">
        <WaiverEditor
          waiverId={waiver.id}
          title={waiver.title}
          expiryRule={waiver.expiryRule}
          minorRule={waiver.minorRule}
          blocks={waiver.draftBlocks}
          relationshipOptions={waiver.minorRule.relationshipOptions}
          hasSignatures={signatureCount > 0}
          latestVersion={versions[0]?.version ?? null}
        />
      </div>

      {versions.length ? (
        <>
          <p className="t-label mt-10">Published versions</p>
          <p className="t-secondary mt-2">
            Each version is an immutable snapshot with its own hash. Signatures point at the one
            they were given and carry a copy of its text, so nothing here can be rewritten.
          </p>
          <div className="mt-3">
            {versions.map((v) => (
              <details key={v.id} className="hairline-b py-3">
                <summary className="flex cursor-pointer items-center justify-between gap-3">
                  <span className="t-title">Version {v.version}</span>
                  <span className="t-data" style={{ color: "var(--color-text-2)" }}>
                    {fmt.format(v.publishedAt).toUpperCase()} · SHA-256 {shortHash(v.textHash)}
                  </span>
                </summary>
                <pre
                  className="t-data mt-3 overflow-x-auto whitespace-pre-wrap p-3"
                  style={{
                    color: "var(--color-text-2)",
                    background: "var(--color-slab)",
                    borderRadius: "12px",
                  }}
                >
                  {renderVersionText({
                    title: v.title,
                    version: v.version,
                    bodyBlocks: v.bodyBlocks,
                    expiryRule: v.expiryRule,
                    minorRule: v.minorRule,
                  })}
                </pre>
              </details>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
