import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { countConnections } from "@/lib/connections";
import { canAddDatabase, plan } from "@/lib/plans";
import { ConnectForm, type ProviderHint } from "./ConnectForm";
import { connectDatabaseAction } from "../actions";
import { detectProviderAction } from "./detect";
import { PROVIDER_GUIDANCE } from "@/lib/providers";

export const metadata: Metadata = { title: "Connect a database" };
export const dynamic = "force-dynamic";

export default async function NewConnectionPage({
  searchParams,
}: {
  searchParams: Promise<{ first?: string }>;
}) {
  const { org } = await requireUser();
  const { first } = await searchParams;
  const used = await countConnections(org.id);
  const limits = plan(org.plan);
  const allowed = canAddDatabase(org.plan, used);

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        {first ? (
          <p className="t-label">Step 1 of 1</p>
        ) : (
          <Link href="/vault" className="btn-quiet no-underline">
            Vault
          </Link>
        )}
        <h1 className="t-h2 mt-3">
          {first ? "Connect the database you would hate to lose." : "Connect a database"}
        </h1>
        <p className="t-secondary mt-1">
          {allowed
            ? "One paste. The first encrypted snapshot lands before you close this tab."
            : `${limits.name} covers ${limits.databases} database${limits.databases === 1 ? "" : "s"} and you are using all of it.`}
        </p>
      </header>

      {allowed ? (
        <ConnectForm
          action={connectDatabaseAction}
          detect={detectProviderAction}
          first={Boolean(first)}
        />
      ) : (
        <section className="panel p-5">
          <p className="t-title">Upgrade to connect another database.</p>
          <p className="t-secondary mt-2">
            Startup covers 5 databases, hourly backups, 90 days of retention and monthly restore
            drills. Business is unlimited databases with weekly drills and the compliance report.
          </p>
          <Link href="/settings/billing" className="btn btn-primary btn-full mt-4 no-underline">
            See plans
          </Link>
        </section>
      )}

      <section className="mt-10">
        <p className="t-label mb-3">Use a read-only role</p>
        <p className="t-secondary">
          VaultBack only ever reads. A dedicated role keeps it that way, and it is two statements:
        </p>
        <pre
          className="panel scroll-x t-data mt-3 p-4"
          style={{ color: "var(--color-text-2)", whiteSpace: "pre" }}
        >
          {PROVIDER_GUIDANCE.generic.readOnlyRoleSql}
        </pre>
        <p className="t-secondary mt-3" style={{ color: "var(--color-text-3)" }}>
          If you paste a superuser connection string we will say so and keep going — nagging, not
          blocking. Provider-specific instructions appear once we detect the provider.
        </p>
      </section>
    </main>
  );
}
