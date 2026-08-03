import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { questionnaireAnswers } from "@/db/schema";
import { requireOnboarded } from "@/lib/auth";
import { canUseAnswerBank, PLANS } from "@/lib/plans";
import { tagFor, templatesFor } from "@/lib/questionnaire";
import { AnswerList, type AnswerView } from "./AnswerList";

export const metadata: Metadata = { title: "Answers" };
export const dynamic = "force-dynamic";

export default async function AnswersPage({
  searchParams,
}: {
  searchParams: Promise<{ framework?: string }>;
}) {
  const { framework: raw } = await searchParams;
  const { org, period } = await requireOnboarded();
  const active: "cdp_style" | "ecovadis_style" =
    raw === "ecovadis_style" ? "ecovadis_style" : "cdp_style";

  const gate = canUseAnswerBank(org.plan);

  if (!gate.allowed) {
    return (
      <main className="screen pt-5">
        <h1 className="t-h2">Questionnaire answers</h1>
        <p className="t-secondary mt-1" style={{ maxWidth: "50ch" }}>
          {templatesFor("custom").length} mapped answers for CDP-style and EcoVadis-style
          questions, with your own figures already interpolated and every number linked back
          to the bill it came from.
        </p>

        <div className="panel mt-6 p-4">
          <p className="t-label">{PLANS.standard.name}</p>
          <p className="t-body mt-2" style={{ maxWidth: "46ch" }}>
            {gate.reason}
          </p>
          <Link href="/settings/billing" className="btn btn-secondary btn-full mt-4">
            See the plans
          </Link>
        </div>

        <section className="mt-8">
          <h2 className="t-label">What an answer looks like</h2>
          <div className="row-plain">
            <p className="t-label">CDP-STYLE C6.2</p>
            <p className="t-title mt-2" style={{ maxWidth: "54ch" }}>
              Describe your organisation&apos;s approach to reporting Scope 2 emissions.
            </p>
            <div className="panel mt-3 p-4">
              <p className="t-body" style={{ maxWidth: "60ch" }}>
                We report both methods, as the Scope 2 Guidance requires. Location-based
                figures use grid-average emission rates for each site&apos;s grid region.
                Market-based figures credit electricity covered by contractual instruments at
                zero and apply the same grid rate to the remainder…
              </p>
            </div>
            <p className="t-data mt-2" style={{ color: "var(--color-fg-2)" }}>
              SOURCES — eGRID subregion factor · the contract, named · both Scope 2 figures
            </p>
          </div>
          <p className="t-secondary mt-3" style={{ maxWidth: "50ch" }}>
            The wording above is the real template. On a Standard plan the figures in it are
            yours.
          </p>
        </section>
      </main>
    );
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(questionnaireAnswers)
    .where(
      and(
        eq(questionnaireAnswers.periodId, period.id),
        eq(questionnaireAnswers.framework, active),
      ),
    );

  const order = new Map(templatesFor(active).map((t, i) => [t.key, i]));
  const answers: AnswerView[] = rows
    .sort((a, b) => (order.get(a.questionKey) ?? 99) - (order.get(b.questionKey) ?? 99))
    .map((a) => ({
      id: a.id,
      tag: tagFor(active, a.questionKey),
      question: a.questionText,
      answerText: a.answerText,
      toneNote: a.toneNote,
      status: a.status,
      refs: a.sourceRefs,
    }));

  const counts = await db
    .select({ framework: questionnaireAnswers.framework })
    .from(questionnaireAnswers)
    .where(eq(questionnaireAnswers.periodId, period.id));

  const readyCount = answers.filter((a) => a.status === "ready").length;

  return (
    <main className="screen pt-5">
      <h1 className="t-h2">Questionnaire answers</h1>
      <p className="t-secondary mt-1" style={{ maxWidth: "52ch" }}>
        Generated from your {period.year} figures. Copy them into the customer&apos;s form;
        every number links back to the bill and the factor behind it.
      </p>

      <AnswerList
        frameworks={[
          {
            id: "cdp_style",
            label: "CDP-style",
            count: counts.filter((c) => c.framework === "cdp_style").length,
          },
          {
            id: "ecovadis_style",
            label: "EcoVadis-style",
            count: counts.filter((c) => c.framework === "ecovadis_style").length,
          },
        ]}
        active={active}
        answers={answers}
        readyCount={readyCount}
      />

      {answers.length === 0 && (
        <p className="t-secondary mt-6" style={{ maxWidth: "50ch" }}>
          Nothing generated for this framework yet. The button above writes{" "}
          {templatesFor(active).length} answers from the figures you have now, and you can
          refresh them any time a figure changes.
        </p>
      )}
    </main>
  );
}
