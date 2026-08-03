import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { accountTemplates, countOpenDeals } from "@/lib/deals";
import { canOpenDeal, planSpec } from "@/lib/plans";
import { datedTasks, parseTemplateTasks } from "@/lib/templates";
import { NewDealForm, type TemplateOption } from "./NewDealForm";

export const metadata: Metadata = { title: "Open a file" };

export default async function NewDealPage() {
  const { user, account } = await requireSession();
  const [templates, openCount] = await Promise.all([
    accountTemplates(account.id),
    countOpenDeals(account.id),
  ]);
  const gate = canOpenDeal(account, openCount);
  const spec = planSpec(account.plan);

  const options: TemplateOption[] = templates.map((t) => {
    const tasks = parseTemplateTasks(t.tasks);
    return {
      id: t.id,
      name: t.name,
      contractType: t.contractType,
      taskCount: tasks.length,
      datedCount: datedTasks(tasks).length,
    };
  });

  return (
    <main className="mx-auto max-w-3xl px-5 pb-24 pt-6 lg:pb-10">
      <p className="t-label">
        <Link href="/deals" className="btn-quiet">
          Pipeline
        </Link>
      </p>
      <h1 className="t-display mt-2">Open a file.</h1>
      <p className="t-body mt-2 text-dim">
        {spec.activeDeals === Number.POSITIVE_INFINITY
          ? `${openCount} files open. Closed files never count.`
          : `${openCount} of ${spec.activeDeals} active files used on ${spec.name}. Closed files never count.`}
      </p>

      {!gate.allowed ? (
        <section className="panel mt-8 p-6">
          <h2 className="t-h2">No room on this plan.</h2>
          <p className="t-body mt-2 text-dim">{gate.reason}</p>
          <Link href="/settings/billing" className="btn btn-primary mt-5">
            See the plans
          </Link>
        </section>
      ) : options.length === 0 ? (
        <section className="panel mt-8 p-6">
          <h2 className="t-h2">No checklist to open it with.</h2>
          <p className="t-body mt-2 text-dim">
            A file needs a checklist template — that is where the date rules live.
          </p>
          <Link href="/templates" className="btn btn-primary mt-5">
            Go to templates
          </Link>
        </section>
      ) : (
        <div className="mt-8">
          <NewDealForm
            templates={options}
            defaultCoordinator={{ name: user.name, email: user.email }}
          />
        </div>
      )}
    </main>
  );
}
