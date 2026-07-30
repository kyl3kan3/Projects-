import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { plan } from "@/lib/plans";
import { env } from "@/lib/env";
import { NewMonitorForm } from "./NewMonitorForm";
import { createMonitorAction } from "../actions";

export const metadata: Metadata = { title: "Add monitor" };

export default async function NewMonitorPage({
  searchParams,
}: {
  searchParams: Promise<{ first?: string }>;
}) {
  const { team } = await requireUser();
  const { first } = await searchParams;
  const limits = plan(team.plan);

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <p className="t-label">{first ? "First monitor" : "New monitor"}</p>
        <h1 className="t-h2 mt-2">
          {first ? "What would you hate to find broken?" : "Add a monitor."}
        </h1>
        {!first ? (
          <Link href="/dashboard" className="btn-quiet mt-3 inline-block no-underline">
            Back to monitors
          </Link>
        ) : null}
      </header>

      <NewMonitorForm
        action={createMonitorAction}
        regions={env.probeRegions}
        minIntervalSeconds={limits.minIntervalSeconds}
        maxRegions={limits.regionsPerCheck}
        first={Boolean(first)}
      />
    </main>
  );
}
