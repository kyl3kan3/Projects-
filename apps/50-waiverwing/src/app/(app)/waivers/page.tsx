import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listVersions, listWaivers } from "@/lib/waivers";
import { IconDocumentPen } from "@/components/icons";
import { NewWaiverForm } from "./NewWaiverForm";

export const metadata: Metadata = { title: "Waivers" };
export const dynamic = "force-dynamic";

export default async function WaiversPage() {
  const { account, location } = await requireUser();
  const waivers = await listWaivers(account.id);

  const withVersions = await Promise.all(
    waivers.map(async (w) => ({ waiver: w, versions: await listVersions(w.id) })),
  );

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: location.timezone,
    month: "short",
    day: "numeric",
  });

  return (
    <div className="px-5 lg:px-0">
      <h1 className="t-h2 pt-6">Waivers</h1>
      <p className="t-secondary mt-2">
        Editing a live waiver creates a new version. Every signature keeps the exact text it was
        given, so a change today never rewrites what someone agreed to last season.
      </p>

      <div className="mt-6">
        {withVersions.length === 0 ? (
          <div className="py-10">
            <IconDocumentPen size={40} style={{ color: "var(--color-text-3)" }} />
            <p className="t-body mt-4">No waivers yet.</p>
            <p className="t-secondary mt-2">
              Start from an activity template and edit the language your attorney wants changed.
            </p>
          </div>
        ) : (
          withVersions.map(({ waiver, versions }) => (
            <Link key={waiver.id} href={`/waivers/${waiver.id}`} className="row no-underline">
              <span className="min-w-0 flex-1">
                <span className="t-title">{waiver.title}</span>
                <span className="t-secondary block truncate">
                  {waiver.status === "live"
                    ? `Live · ${waiver.expiryRule === "visit" ? "per visit" : waiver.expiryRule === "forever" ? "no expiry" : "365 days"} · minors under ${waiver.minorRule.ageOfMajority}`
                    : "Draft — not signable yet"}
                </span>
              </span>
              <span className="t-data shrink-0" style={{ color: "var(--color-text-2)" }}>
                {versions.length
                  ? `V${versions[0].version} · ${fmt.format(versions[0].publishedAt).toUpperCase()}`
                  : "UNPUBLISHED"}
              </span>
            </Link>
          ))
        )}
      </div>

      <p className="t-label mt-10">Start a new waiver</p>
      <div className="mt-3">
        <NewWaiverForm />
      </div>
    </div>
  );
}
