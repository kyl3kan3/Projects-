/**
 * /api/pursuits
 *
 * The read API a Capture-tier firm uses for CSV/BI export, and the write endpoint
 * for creating a pursuit from outside the app.
 *
 * The UI does not use this — its buttons call server actions directly, which is
 * both faster and one fewer public surface. This exists because "API/CSV export"
 * is a Capture line item in README's pricing table, and an export that cannot be
 * scripted is not an export.
 *
 * GET  /api/pursuits?stage=drafting[&format=csv]
 * POST /api/pursuits  { matchId }  |  { title, valueCents?, proposalDueAt? }
 */

import { z } from "zod";
import { currentContext } from "@/lib/auth";
import { hasReporting, hasResponseWorkspace } from "@/lib/plans";
import { createManualPursuit, listPursuits, pursueMatch } from "@/lib/pursuits";
import { parseFlexibleDate } from "@/lib/parse";
import { stageLabel } from "@/lib/format";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STAGES = [
  "watching",
  "go_no_go",
  "drafting",
  "submitted",
  "won",
  "lost",
  "no_bid",
] as const;

const createSchema = z
  .object({
    matchId: z.string().uuid().optional(),
    title: z.string().min(1).max(300).optional(),
    valueCents: z.number().int().nonnegative().optional(),
    proposalDueAt: z.string().optional(),
  })
  // Exactly one origin: a match, or a title typed by a human. Both at once is a
  // caller that has not decided what it wants.
  .refine((value) => Boolean(value.matchId) !== Boolean(value.title), {
    message: "Provide exactly one of matchId or title.",
  });

export async function GET(request: Request): Promise<Response> {
  const ctx = await currentContext();
  if (!ctx) return Response.json({ error: "Not authenticated." }, { status: 401 });
  if (!hasReporting(ctx.access.planId)) {
    return Response.json(
      { error: "API export is included on Capture.", plan: ctx.access.planId },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const stageParam = url.searchParams.get("stage");
  const stages = stageParam
    ? stageParam
        .split(",")
        .map((value) => value.trim())
        .filter((value): value is (typeof STAGES)[number] =>
          (STAGES as readonly string[]).includes(value),
        )
    : undefined;

  const rows = await listPursuits(ctx.firm.id, { stages });
  const records = rows.map((row) => ({
    id: row.pursuit.id,
    title: row.pursuit.title,
    stage: row.pursuit.stage,
    stageLabel: stageLabel(row.pursuit.stage),
    owner: row.ownerName,
    valueCents: row.pursuit.valueCents,
    verdict: row.verdict,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    nextDueAt: row.nextDueAt?.toISOString() ?? null,
    closedAt: row.pursuit.closedAt?.toISOString() ?? null,
    noticeId: row.opportunity?.externalId ?? null,
    agency: row.opportunity?.agency ?? null,
    outcomeNote: row.pursuit.outcomeNote,
  }));

  if (url.searchParams.get("format") === "csv") {
    return new Response(toCsv(records), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="rfpradar-pursuits.csv"',
        "cache-control": "no-store",
      },
    });
  }

  return Response.json({ count: records.length, pursuits: records });
}

export async function POST(request: Request): Promise<Response> {
  const ctx = await currentContext();
  if (!ctx) return Response.json({ error: "Not authenticated." }, { status: 401 });
  if (ctx.access.readOnly) {
    return Response.json({ error: ctx.access.reason }, { status: 402 });
  }
  if (!hasResponseWorkspace(ctx.access.planId)) {
    return Response.json(
      { error: "The response workspace is included on Pursuit and above." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid body.", issues: parsed.error.issues.map((issue) => issue.message) },
      { status: 400 },
    );
  }

  try {
    if (parsed.data.matchId) {
      const result = await pursueMatch({
        firmId: ctx.firm.id,
        actorUserId: ctx.user.id,
        matchId: parsed.data.matchId,
      });
      return Response.json(
        {
          pursuitId: result.pursuit.id,
          stage: result.pursuit.stage,
          deadlinesCreated: result.deadlinesCreated,
        },
        { status: 201 },
      );
    }

    const pursuit = await createManualPursuit({
      firmId: ctx.firm.id,
      actorUserId: ctx.user.id,
      title: parsed.data.title!,
      valueCents: parsed.data.valueCents ?? null,
      proposalDueAt: parseFlexibleDate(parsed.data.proposalDueAt ?? null),
    });
    return Response.json({ pursuitId: pursuit.id, stage: pursuit.stage }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not create the pursuit." },
      { status: 400 },
    );
  }
}

function toCsv(records: Array<Record<string, unknown>>): string {
  if (records.length === 0) return "";
  const headers = Object.keys(records[0]);
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [
    headers.join(","),
    ...records.map((record) => headers.map((header) => escape(record[header])).join(",")),
  ].join("\r\n");
}
