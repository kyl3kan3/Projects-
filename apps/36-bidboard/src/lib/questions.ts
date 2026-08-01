/**
 * The Q&A thread on a package.
 *
 * An answer goes to **every** bidder on the trade, at the same time, in the same
 * words. That is not a nicety: a private answer to one bidder is an unfair
 * advantage, and in this industry that is the accusation a GC cannot afford. The
 * broadcast is stamped on the row so the record shows it happened.
 *
 * Who asked is never broadcast. The estimator sees it; other bidders see the
 * question and the answer, not the name.
 */

import { and, asc, desc, eq, isNull, ne } from "drizzle-orm";
import { getDb } from "@/db";
import {
  invitations,
  projects,
  questions,
  subCompanies,
  tradePackages,
  type Question,
  type SubCompany,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { sendQaBroadcast } from "@/lib/notify";
import { tokenForInvitation } from "@/lib/portal-tokens";

export class QuestionError extends Error {}

export interface QuestionRow {
  question: Question;
  /** The asker — estimator-side only. */
  asker: SubCompany;
}

export async function questionsFor(
  companyId: string,
  packageId: string,
): Promise<QuestionRow[]> {
  const db = getDb();
  const rows = await db
    .select({ question: questions, asker: subCompanies })
    .from(questions)
    .innerJoin(invitations, eq(questions.invitationId, invitations.id))
    .innerJoin(subCompanies, eq(invitations.subCompanyId, subCompanies.id))
    .where(and(eq(questions.companyId, companyId), eq(questions.tradePackageId, packageId)))
    .orderBy(desc(questions.createdAt));
  return rows;
}

export async function unansweredCount(companyId: string, packageId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ id: questions.id })
    .from(questions)
    .where(
      and(
        eq(questions.companyId, companyId),
        eq(questions.tradePackageId, packageId),
        isNull(questions.answeredAt),
      ),
    );
  return rows.length;
}

/**
 * Answer a question and broadcast it.
 *
 * The mail is deduped per (question, invitation), so answering twice — or editing
 * an answer — never re-mails a bidder who already has it. Editing an answer is
 * therefore deliberately *not* a re-broadcast: the estimator posts a follow-up
 * question instead, which is how addenda work on paper too.
 */
export async function answerQuestion(
  companyId: string,
  actor: { userId: string; label: string },
  input: { questionId: string; answer: string; broadcast: boolean },
): Promise<{ notified: number }> {
  const db = getDb();
  const answer = input.answer.trim().slice(0, 4000);
  if (answer.length < 2) throw new QuestionError("Write an answer first");

  const [row] = await db
    .select({ question: questions, pkg: tradePackages, project: projects })
    .from(questions)
    .innerJoin(tradePackages, eq(questions.tradePackageId, tradePackages.id))
    .innerJoin(projects, eq(tradePackages.projectId, projects.id))
    .where(and(eq(questions.id, input.questionId), eq(questions.companyId, companyId)));
  if (!row) throw new QuestionError("That question is not on one of your packages");

  const now = new Date();
  await db
    .update(questions)
    .set({
      answerBody: answer,
      answeredAt: row.question.answeredAt ?? now,
      broadcastAt: input.broadcast ? (row.question.broadcastAt ?? now) : row.question.broadcastAt,
    })
    .where(eq(questions.id, row.question.id));

  let notified = 0;
  if (input.broadcast) {
    const { companies, subContacts } = await import("@/db/schema");
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    const bidders = await db
      .select({ invitation: invitations, contact: subContacts })
      .from(invitations)
      .innerJoin(subContacts, eq(invitations.subContactId, subContacts.id))
      .where(
        and(
          eq(invitations.tradePackageId, row.pkg.id),
          isNull(invitations.revokedAt),
          isNull(invitations.declinedAt),
          ne(invitations.status, "declined"),
        ),
      );

    for (const { invitation, contact } of bidders) {
      const outcome = await sendQaBroadcast({
        company: company!,
        project: row.project,
        pkg: row.pkg,
        contact,
        invitation,
        token: await tokenForInvitation(invitation),
        questionId: row.question.id,
        question: row.question.body,
        answer,
      });
      if (outcome !== "duplicate") notified += 1;
    }
  }

  await audit({
    companyId,
    actorKind: "user",
    actorId: actor.userId,
    actorLabel: actor.label,
    action: input.broadcast ? "question.answered_broadcast" : "question.answered",
    target: `question:${row.question.id}`,
    metadata: { notified },
  });

  return { notified };
}

/** Questions on a package, oldest first — for the export's addenda section. */
export async function answeredQuestions(
  companyId: string,
  packageId: string,
): Promise<Question[]> {
  const db = getDb();
  return db
    .select()
    .from(questions)
    .where(
      and(
        eq(questions.companyId, companyId),
        eq(questions.tradePackageId, packageId),
        ne(questions.answerBody, ""),
      ),
    )
    .orderBy(asc(questions.createdAt));
}
