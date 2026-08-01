import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ProfileForm } from "../settings/SettingsForms";

export const metadata: Metadata = { title: "Set up GrantGrid" };
export const dynamic = "force-dynamic";

/**
 * First run. One screen rather than DESIGN.md's four conversational steps: the four
 * questions are all on it, in that order, with the reason each one is asked stated
 * beside it. A wizard that hides the fourth question behind three taps is worse for
 * the person who wants to get to their pipeline, and this audience is not short of
 * patience — it is short of time.
 */
export default async function OnboardingPage() {
  const { org, user } = await requireUser();

  return (
    <div className="screen">
      <header className="pt-10">
        <p className="t-label">Step one of one</p>
        <h1 className="t-display mt-3">Four things, and discovery starts working.</h1>
        <p className="t-body mt-4" style={{ color: "var(--color-ink-2)" }}>
          Where you work, what you do, what you usually ask for, and how big you are.
          Those four answers are what fit scoring compares every funder against — and
          until they are filled in, GrantGrid shows no scores at all rather than guessing
          at one.
        </p>
      </header>

      <div className="rule-t mt-8 pt-8">
        <ProfileForm
          values={{
            name: org.name,
            mission: org.profile.mission,
            programs: org.profile.programs,
            budgetBand: org.profile.budgetBand,
            serviceStates: org.profile.serviceStates,
            causeCodes: org.profile.causeCodes,
            ein: org.profile.ein,
            typicalAsk: org.profile.typicalAskCents
              ? String(Math.round(org.profile.typicalAskCents / 100))
              : "",
          }}
          redirectToPipeline
          submitLabel="Save and open my pipeline"
        />
      </div>

      <p className="t-secondary rule-t mt-8 pt-4" style={{ color: "var(--color-ink-2)" }}>
        You can change all of this later in Settings.{" "}
        <Link href="/pipeline" className="btn-quiet" style={{ minHeight: 0 }}>
          Skip for now
        </Link>{" "}
        — your library is already seeded with starter blocks for {user.email.split("@")[0]}
        &rsquo;s org.
      </p>
    </div>
  );
}
