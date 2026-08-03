import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ScreenHeader } from "@/components/ScreenHeader";
import { FunderCard } from "./FunderCard";
import {
  SIZE_FILTERS,
  coverage,
  searchFunders,
  sizeFilterFor,
} from "@/lib/discovery";
import {
  CAUSE_AREAS,
  causeLabel,
  profileCompleteness,
  type ScoringProfile,
} from "@/lib/fit-score";
import { effectivePlan } from "@/lib/billing";
import { hasDiscovery, plan } from "@/lib/plans";

export const metadata: Metadata = { title: "Discovery" };
export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = {
  private_foundation: "Private foundation",
  community: "Community foundation",
  corporate: "Corporate giving",
};

export default async function DiscoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; cause?: string; size?: string; q?: string }>;
}) {
  const { org } = await requireUser();
  const params = await searchParams;
  const activePlan = effectivePlan(org);

  if (!hasDiscovery(activePlan)) {
    return (
      <div className="screen">
        <ScreenHeader title="Discovery" />
        <section className="pt-8">
          <h2 className="t-h2">Discovery is part of Grow.</h2>
          <p className="t-body mt-3" style={{ color: "var(--color-ink-2)" }}>
            You are on {plan(activePlan).name}. Your pipeline, calendar, reminders and
            answer library all keep working exactly as they are — nothing has been hidden
            or removed. Grow adds the curated funder feed with fit scoring and the
            application workspace.
          </p>
          <Link href="/settings/billing" className="btn btn-primary mt-6 w-full lg:w-auto">
            See plans
          </Link>
        </section>
      </div>
    );
  }

  const profile: ScoringProfile = {
    mission: org.profile.mission,
    serviceStates: org.profile.serviceStates,
    causeCodes: org.profile.causeCodes,
    typicalAskCents: org.profile.typicalAskCents,
    budgetBand: org.profile.budgetBand,
  };
  const completeness = profileCompleteness(profile);

  const { approved, states } = await coverage();
  const filterStates = states.filter((s) => s !== "US");

  const results = await searchFunders(
    org.id,
    profile,
    org.profileVersion,
    {
      state: params.state ?? null,
      cause: params.cause ?? null,
      minSizeCents: sizeFilterFor(params.size ?? null),
      query: params.q ?? null,
    },
    causeLabel,
  );

  const sampleCount = results.filter((r) => r.funder.isSample).length;

  function href(patch: Record<string, string | undefined>): string {
    const next = new URLSearchParams();
    const merged = { ...params, ...patch };
    for (const [key, value] of Object.entries(merged)) {
      if (value) next.set(key, value);
    }
    const query = next.toString();
    return query ? `/discovery?${query}` : "/discovery";
  }

  return (
    <div className="screen">
      <ScreenHeader
        title="Discovery"
        summary={`${approved} FUNDERS · ${filterStates.length} STATES`}
      />

      {/* The standing honesty banner. Sample data is labelled at the top of the
          screen as well as on every card. */}
      {sampleCount > 0 ? (
        <p className="t-secondary rule-b py-3">
          <strong style={{ color: "var(--color-brick-text)" }}>
            This build ships {sampleCount} sample funder records.
          </strong>{" "}
          They are illustrative, not live opportunities: the names begin
          &ldquo;Sample&rdquo;, the EINs are not IRS-issued, and the links go to
          example.org. Real records come from IRS 990-PF filings and reach this screen
          only after a curator has read them.
        </p>
      ) : null}

      {!completeness.scorable ? (
        <section className="rule-b py-4">
          <h2 className="t-title">No fit scores yet — and that is deliberate.</h2>
          <p className="t-secondary mt-2">
            A score built from a blank profile would be a guess in a uniform. GrantGrid
            needs {completeness.missing.join(", ")} before it will compare anything. The
            cards below are still browsable.
          </p>
          <Link href="/settings/profile" className="btn btn-primary mt-4 w-full lg:w-auto">
            Complete your profile
          </Link>
        </section>
      ) : null}

      {/* Filters */}
      <div className="-mx-5 overflow-x-auto px-5 pt-4">
        <div className="flex gap-2">
          <Link href={href({ state: undefined })} className="chip" data-active={!params.state}>
            All states
          </Link>
          {filterStates.map((state) => (
            <Link
              key={state}
              href={href({ state })}
              className="chip"
              data-active={params.state === state}
            >
              {state}
            </Link>
          ))}
        </div>
      </div>
      <div className="-mx-5 overflow-x-auto px-5 pt-4">
        <div className="flex gap-2">
          <Link href={href({ cause: undefined })} className="chip" data-active={!params.cause}>
            All causes
          </Link>
          {CAUSE_AREAS.map((cause) => (
            <Link
              key={cause.code}
              href={href({ cause: cause.code })}
              className="chip"
              data-active={params.cause === cause.code}
            >
              {cause.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="-mx-5 overflow-x-auto px-5 pt-4 pb-2">
        <div className="flex gap-2">
          {SIZE_FILTERS.map((size) => (
            <Link
              key={size.code}
              href={href({ size: size.code === "any" ? undefined : size.code })}
              className="chip"
              data-active={(params.size ?? "any") === size.code}
            >
              {size.label}
            </Link>
          ))}
        </div>
      </div>

      {results.length === 0 ? (
        <section className="pt-8">
          <h2 className="t-h2">Nothing matches those filters.</h2>
          <p className="t-body mt-3" style={{ color: "var(--color-ink-2)" }}>
            The curated set is deliberately narrow — a small, checked database beats a
            large, stale one when the cost of a bad lead is a week of someone&rsquo;s
            time.
          </p>
          <Link href="/discovery" className="btn btn-secondary mt-6 w-full lg:w-auto">
            Clear the filters
          </Link>
        </section>
      ) : (
        <div
          className="md:grid md:gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}
        >
          {results.map((result) => (
            <FunderCard
              key={result.funder.id}
              funderId={result.funder.id}
              name={result.funder.name}
              ein={result.funder.ein}
              kindLabel={KIND_LABELS[result.funder.kind] ?? "Funder"}
              isSample={result.funder.isSample}
              profileLine={result.profileLine}
              freshnessLine={result.freshnessLine}
              deadlinesNote={result.funder.deadlinesNote}
              applicationUrl={result.funder.applicationUrl}
              score={result.score}
              missing={completeness.missing}
              inPipeline={result.inPipeline}
              defaultAsk={
                org.profile.typicalAskCents
                  ? String(Math.round(org.profile.typicalAskCents / 100))
                  : ""
              }
              recentAwards={result.recentAwards}
            />
          ))}
        </div>
      )}

      <p className="t-secondary rule-t mt-8 pt-4" style={{ color: "var(--color-ink-2)" }}>
        Fit scores compare your profile against published giving records only —
        geography, cause areas, grant sizes, stated application policy, and how often
        recent grantees were new. They cannot see a program officer&rsquo;s priorities,
        this year&rsquo;s unpublished strategy, or who a funder already intends to fund.
        Read the guidelines before you write.
      </p>
    </div>
  );
}
