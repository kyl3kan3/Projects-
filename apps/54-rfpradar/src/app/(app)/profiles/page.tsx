import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { keywordProfiles } from "@/db/schema";
import { requireFirm } from "@/lib/auth";
import { dismissReasonCounts } from "@/lib/matching";
import { formatValueBand } from "@/lib/format";
import { checkProfile, plan } from "@/lib/plans";
import { StatusPill } from "@/components/StatusPill";
import { ProfileForm } from "./ProfileForm";
import { toggleProfileAction } from "./actions";

export const metadata: Metadata = { title: "Keyword profiles" };

/**
 * /profiles — what the firm hunts.
 *
 * The dismissal counts at the bottom are the precision loop made visible: four
 * notices thrown away for "Wrong vehicle" is a suggestion about this profile, and
 * showing the tally next to the fields is the cheapest possible version of that
 * feature.
 */
export default async function ProfilesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const { firm, access } = await requireFirm();
  const { edit } = await searchParams;
  const db = getDb();

  const profiles = await db
    .select()
    .from(keywordProfiles)
    .where(eq(keywordProfiles.firmId, firm.id))
    .orderBy(keywordProfiles.createdAt);
  const editing = edit ? profiles.find((profile) => profile.id === edit) : undefined;
  const reasons = await dismissReasonCounts(firm.id);
  const gate = checkProfile(access.planId, profiles.length);
  const planned = plan(access.planId);

  return (
    <main className="pt-4">
      <h1 className="t-h2">Keyword profiles</h1>
      <p className="t-body mt-2" style={{ color: "var(--color-ink-2)" }}>
        A profile is a standing question put to every feed each morning. {planned.name} includes{" "}
        {planned.profiles} profile{planned.profiles === 1 ? "" : "s"}.
      </p>

      <section className="mt-6 flex flex-col gap-3">
        {profiles.map((profile) => (
          <article key={profile.id} className="card p-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="t-title">{profile.name}</h2>
                <p className="t-secondary mt-1">
                  {profile.keywords.length} keyword{profile.keywords.length === 1 ? "" : "s"} ·{" "}
                  {profile.naicsCodes.length} NAICS · {profile.states.length || "any"} state
                  {profile.states.length === 1 ? "" : "s"}
                </p>
              </div>
              <StatusPill
                label={profile.status}
                tone={profile.status === "active" ? "ok" : "quiet"}
              />
            </div>

            <p className="t-mono mt-3" style={{ color: "var(--color-ink-3)" }}>
              {[
                profile.naicsCodes.join(" ") || "no NAICS",
                profile.states.join(" ") || "any state",
                formatValueBand(profile.valueBand as never) ?? "any value",
              ].join(" · ")}
            </p>

            {profile.keywords.length > 0 && (
              <p className="t-secondary mt-2">
                Looking for: {profile.keywords.map((keyword) => `“${keyword}”`).join(", ")}
              </p>
            )}
            {profile.negativeKeywords.length > 0 && (
              <p className="t-secondary mt-1">
                Vetoing: {profile.negativeKeywords.map((keyword) => `“${keyword}”`).join(", ")}
              </p>
            )}

            <div className="mt-3 flex items-center gap-4">
              <Link href={`/profiles?edit=${profile.id}`} className="btn-quiet">
                Edit
              </Link>
              <form action={toggleProfileAction}>
                <input type="hidden" name="id" value={profile.id} />
                <button className="btn-quiet" type="submit">
                  {profile.status === "active" ? "Pause" : "Resume"}
                </button>
              </form>
            </div>
          </article>
        ))}

        {profiles.length === 0 && (
          <p className="t-secondary">
            No profiles yet. The form below is the whole setup — a name, a few phrases, your NAICS
            codes, and the states you work in.
          </p>
        )}
      </section>

      {reasons.length > 0 && (
        <section className="mt-8">
          <h2 className="t-label">What you have been dismissing</h2>
          <div className="rows mt-1">
            {reasons.map((row) => (
              <div key={row.reason} className="py-3 flex items-center gap-3">
                <span className="t-body flex-1">{row.reason}</span>
                <span className="t-mono" style={{ color: "var(--color-ink-3)" }}>
                  {row.count}
                </span>
              </div>
            ))}
          </div>
          <p className="t-secondary mt-2">
            Repeated dismissals point at a field above: “Wrong vehicle” usually means a negative
            keyword, “Too small” means a value band.
          </p>
        </section>
      )}

      <section className="mt-8">
        <h2 className="t-h2">{editing ? `Edit “${editing.name}”` : "New profile"}</h2>
        {!editing && !gate.allowed ? (
          <div className="card p-4 mt-3">
            <p className="t-body">{gate.message}</p>
            <Link href="/settings/billing" className="btn btn-secondary mt-3">
              See plans
            </Link>
          </div>
        ) : (
          <div className="mt-3">
            <ProfileForm profile={editing} />
          </div>
        )}
        {editing && (
          <Link href="/profiles" className="btn-quiet mt-3">
            Cancel editing
          </Link>
        )}
      </section>
    </main>
  );
}
