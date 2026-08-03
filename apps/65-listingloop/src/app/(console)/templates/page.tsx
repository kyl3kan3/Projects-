import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { accountTemplates } from "@/lib/deals";
import { canEditTemplates } from "@/lib/plans";
import { CONTRACT_TYPE_LABELS, datedTasks, parseTemplateTasks, ruleReadback } from "@/lib/templates";
import { NewTemplateForm } from "./NewTemplateForm";

export const metadata: Metadata = { title: "Templates" };

export default async function TemplatesPage() {
  const { account } = await requireSession();
  const templates = await accountTemplates(account.id);
  const gate = canEditTemplates(account);

  return (
    <main className="mx-auto max-w-4xl px-5 pb-24 pt-6 lg:pb-10">
      <h1 className="t-display">Checklists.</h1>
      <p className="t-body mt-2 text-dim">
        A template is the tasks a contract type carries, who owns each one, whether a document has
        to land, and the rule that computes its deadline. The four you started with are written
        against a generic residential resale contract — edit them to match your state form.
      </p>

      {!gate.allowed ? (
        <p className="panel mt-6 p-4">
          <span className="t-secondary">{gate.reason}</span>
        </p>
      ) : null}

      <ul className="mt-8 list-none p-0">
        {templates.map((t) => {
          const tasks = parseTemplateTasks(t.tasks);
          const dated = datedTasks(tasks);
          return (
            <li key={t.id} className="hairline-b py-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="min-w-0">
                  {gate.allowed ? (
                    <Link href={`/templates/${t.id}`} className="t-title text-ink">
                      {t.name}
                    </Link>
                  ) : (
                    <span className="t-title">{t.name}</span>
                  )}
                  <span className="t-secondary block">
                    {CONTRACT_TYPE_LABELS[t.contractType]} · {tasks.length} tasks ·{" "}
                    {dated.length} with a date rule ·{" "}
                    {tasks.filter((x) => x.docRequired).length} needing a document
                  </span>
                </span>
              </div>
              {dated.length > 0 ? (
                <p className="t-secondary mt-2">
                  Earliest rule: {ruleReadback(dated[0].rule)}
                </p>
              ) : (
                <p className="t-secondary mt-2">
                  No date rules yet — a file opened with this template has a checklist but no
                  timeline.
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {templates.length === 0 ? (
        <section className="panel mt-8 p-6">
          <h2 className="t-h2">No checklists on this desk.</h2>
          <p className="t-body mt-2 text-dim">
            Start from a residential resale checklist and edit it — that is faster than building
            one from nothing.
          </p>
        </section>
      ) : null}

      {gate.allowed ? (
        <section className="mt-10">
          <h2 className="t-h2">Start a new checklist</h2>
          <p className="t-secondary mt-1">
            It begins as a copy of the matching starter, so you edit rather than type.
          </p>
          <NewTemplateForm />
        </section>
      ) : null}
    </main>
  );
}
