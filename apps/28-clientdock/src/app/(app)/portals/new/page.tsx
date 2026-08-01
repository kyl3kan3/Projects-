import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listClients, listTemplates, countClientPortals } from "@/lib/portals";
import { MODULE_IDS, type ModuleId } from "@/db/schema";
import { canCreatePortal, moduleAllowed, moduleUpsell, portalLimitMessage } from "@/lib/plans";
import { NewPortalForm } from "./NewPortalForm";

export const metadata: Metadata = { title: "New portal" };

export default async function NewPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ first?: string }>;
}) {
  const { workspace } = await requireUser();
  const first = (await searchParams).first === "1";
  const [clients, templates, count] = await Promise.all([
    listClients(workspace.id),
    listTemplates(workspace.id),
    countClientPortals(workspace.id),
  ]);

  const allowed = MODULE_IDS.filter((m) => moduleAllowed(workspace.plan, m)) as ModuleId[];
  const gated = MODULE_IDS.filter((m) => !moduleAllowed(workspace.plan, m)).map((id) => ({
    id: id as ModuleId,
    upsell: moduleUpsell(workspace.plan, id) ?? "",
  }));

  if (!canCreatePortal(workspace.plan, count)) {
    return (
      <main className="screen screen-app">
        <header className="pt-10 pb-6">
          <h1 className="t-display">You&apos;re at the plan&apos;s limit.</h1>
          <p className="t-secondary mt-3">{portalLimitMessage(workspace.plan)}</p>
        </header>
        <Link href="/settings/billing" className="btn btn-primary btn-full">
          See the plans
        </Link>
        <Link href="/dashboard" className="btn-quiet mt-6 inline-block">
          Back to portals
        </Link>
      </main>
    );
  }

  return (
    <main className="screen screen-app" style={{ maxWidth: 640 }}>
      <header className="pt-10 pb-6">
        <p className="t-label">{first ? "First portal" : "New portal"}</p>
        <h1 className="t-display mt-2">
          {first ? "Let's furnish one room at a time." : "Build a portal."}
        </h1>
        <p className="t-secondary mt-3">
          {first
            ? "Pick the client, keep the modules you'll actually keep current, and send one link. Four minutes."
            : "Modules can change any time; nothing you switch off is deleted."}
        </p>
      </header>

      <NewPortalForm
        clients={clients.map((c) => ({ id: c.id, company: c.company }))}
        templates={templates.map((t) => ({ id: t.id, name: t.templateName ?? t.title }))}
        agencyName={workspace.name}
        allowedModules={allowed}
        gatedModules={gated}
      />
    </main>
  );
}
