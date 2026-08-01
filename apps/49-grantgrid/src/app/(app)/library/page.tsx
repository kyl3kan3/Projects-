import type { Metadata } from "next";
import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { answers, workspaceItems } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ScreenHeader } from "@/components/ScreenHeader";
import {
  answerKindLabel,
  excerpt,
  staleness,
  stalenessLabel,
} from "@/lib/answers";
import { AnswerEditor, CopyBlock } from "./LibraryPanels";
import { deleteAnswerAction, markReviewedAction } from "./actions";
import { HoldToDelete } from "../pipeline/[id]/GrantPanels";

export const metadata: Metadata = { title: "Answer library" };
export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const { org } = await requireUser();
  const db = getDb();
  const now = new Date();

  const blocks = await db
    .select()
    .from(answers)
    .where(eq(answers.organizationId, org.id))
    .orderBy(asc(answers.kind), asc(answers.title));

  // How many grant drafts each block has been used in — the switching-cost number,
  // and the reason a stale block matters rather than merely being untidy.
  const usage = await db
    .select({
      answerId: workspaceItems.answerId,
      count: sql<number>`count(*)::int`,
    })
    .from(workspaceItems)
    .where(eq(workspaceItems.organizationId, org.id))
    .groupBy(workspaceItems.answerId);
  const usageById = new Map(
    usage.filter((u) => u.answerId).map((u) => [u.answerId as string, u.count]),
  );

  const stale = blocks.filter((b) => staleness(b, now) === "stale");

  return (
    <div className="screen">
      <ScreenHeader
        title="Answer library"
        summary={`${blocks.length} BLOCKS${stale.length ? ` · ${stale.length} STALE` : ""}`}
      />

      {stale.length ? (
        <p className="t-secondary rule-b py-3">
          <strong style={{ color: "var(--color-brick-text)" }}>
            {stale.length} {stale.length === 1 ? "block has" : "blocks have"} not been
            reviewed in over a year.
          </strong>{" "}
          Board lists and financial figures are the two things funders check and the two
          things that quietly go out of date.
        </p>
      ) : null}

      {blocks.length === 0 ? (
        <section className="pt-8">
          <h2 className="t-h2">Your library is empty.</h2>
          <p className="t-body mt-3" style={{ color: "var(--color-ink-2)" }}>
            Add the paragraphs you retype for every funder: mission short and long, each
            program, the budget table, the board list, and where the 501(c)(3) letter
            lives. Then every application starts from something.
          </p>
          <div className="mt-6">
            <AnswerEditor trigger="add" />
          </div>
        </section>
      ) : (
        <>
          <div className="pt-2">
            {blocks.map((block) => {
              const flag = staleness(block, now);
              const used = usageById.get(block.id) ?? 0;
              return (
                <div key={block.id} className="rule-b py-3">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="t-title">
                        {block.title}{" "}
                        <span className="t-data" style={{ color: "var(--color-ink-2)" }}>
                          V{block.version}
                        </span>
                      </p>
                      <p className="t-secondary mt-1">
                        {block.body ? excerpt(block.body, 110) : "Nothing written yet"}
                      </p>
                      <p className="t-label mt-2">
                        <span
                          style={{
                            color:
                              flag === "stale"
                                ? "var(--color-brick-text)"
                                : "var(--color-ink-2)",
                          }}
                        >
                          {stalenessLabel(block, now)}
                        </span>
                        {" · "}
                        {answerKindLabel(block.kind)}
                        {used ? ` · used in ${used} ${used === 1 ? "draft" : "drafts"}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-4">
                    <CopyBlock body={block.body} label={block.title} />
                    <AnswerEditor
                      trigger="edit"
                      answerId={block.id}
                      title={block.title}
                      kind={block.kind}
                      body={block.body}
                    />
                    <form action={markReviewedAction}>
                      <input type="hidden" name="answerId" value={block.id} />
                      <button className="btn-quiet" type="submit">
                        Mark reviewed
                      </button>
                    </form>
                  </div>
                  {flag === "stale" ? (
                    <HoldToDelete
                      action={deleteAnswerAction}
                      hiddenFields={{ answerId: block.id }}
                      label="Hold to delete this block"
                      confirmLabel="Delete it"
                    />
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="pt-6">
            <AnswerEditor trigger="add" />
          </div>
        </>
      )}

      <p className="t-secondary rule-t mt-8 pt-4" style={{ color: "var(--color-ink-2)" }}>
        Linking a block into a grant copies its text as it reads at that moment. Editing
        it here never rewrites an application you already sent — the workspace is a record
        of what was actually submitted.
      </p>
    </div>
  );
}
