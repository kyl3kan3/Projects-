import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { resolvePlaybook } from "@/lib/playbook-store";
import { describeRule } from "@/lib/playbook";
import { canEditPlaybook, PLANS } from "@/lib/plans";
import { CLAUSE_LABELS } from "@/lib/taxonomy";
import { RuleEditor, type EditableRule } from "./RuleEditor";
import { ForkButton } from "./ForkButton";

export const metadata: Metadata = { title: "Playbook" };

/**
 * The playbook screen: the rules, in the order they run, with the numbers they compare
 * against. Inspectable by anyone on any plan — the determinism claim is only worth
 * something if the rules are readable.
 */
export default async function PlaybookPage() {
  const { account } = await requireUser();
  const { playbook, rules, isDefault } = await resolvePlaybook(account.id);
  const editable = canEditPlaybook(account.plan) && !isDefault;

  const editableRules: EditableRule[] = rules.map((rule) => ({
    id: rule.id,
    ruleKey: rule.ruleKey,
    title: rule.title,
    clauseLabel: CLAUSE_LABELS[rule.clauseType],
    severityOnFail: rule.severityOnFail,
    enabled: rule.enabled,
    threshold: rule.threshold,
    thresholdUnit: rule.comparator.field?.includes("days") ? "days" : null,
    condition: describeRule(rule),
  }));

  const high = rules.filter((r) => r.severityOnFail === "high").length;

  return (
    <main className="screen">
      <header className="pt-8">
        <p className="t-label">{isDefault ? "Built-in playbook" : "Your house rules"}</p>
        <h1 className="t-h2 mt-2">{playbook.name}</h1>
        <p className="t-data mt-2" style={{ color: "var(--color-text-2)" }}>
          v{playbook.version} · {rules.length} RULES · {high} RATED HIGH
        </p>
        <p className="t-body mt-4" style={{ color: "var(--color-text-2)" }}>
          Every report is scored against these rules and nothing else. The same contract and
          the same playbook version always produce the same flags — that is the point of
          scoring against written rules instead of asking a model what it thinks.
        </p>
      </header>

      {isDefault && (
        <section className="card mt-6 p-5">
          <p className="t-title">
            {canEditPlaybook(account.plan)
              ? "Make these yours"
              : `Custom rules are part of ${PLANS.studio.name}`}
          </p>
          <p className="t-secondary mt-2">
            {canEditPlaybook(account.plan)
              ? "Copy the built-in playbook into an editable set of house rules. Reports already written keep the version they were scored with."
              : "On Studio you can change thresholds, turn rules off, and raise a rule to HIGH — \"we never accept non-competes\" is this list with one rule turned up."}
          </p>
          <div className="mt-4">
            {canEditPlaybook(account.plan) ? (
              <ForkButton />
            ) : (
              <Link href="/settings/billing" className="btn-quiet">
                See Studio
              </Link>
            )}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="t-label mb-1">Rules, in the order they run</h2>
        {editableRules.map((rule) => (
          <RuleEditor key={rule.id} rule={rule} editable={editable} />
        ))}
      </section>
    </main>
  );
}
