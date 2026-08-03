/**
 * Download a generated contract suite as a file.
 *
 * Scoped to the caller's organization through the API row, so a suite id from
 * another tenant is a 404 rather than a download.
 */

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { apis, contractSuites } from "@/db/schema";
import { currentContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await currentContext();
  if (!ctx) return new NextResponse("Sign in first.", { status: 401 });

  const { id } = await params;
  const [row] = await getDb()
    .select({ suite: contractSuites })
    .from(contractSuites)
    .innerJoin(apis, eq(contractSuites.apiId, apis.id))
    .where(and(eq(contractSuites.id, id), eq(apis.organizationId, ctx.org.id)));
  if (!row) return new NextResponse("Not found.", { status: 404 });

  return new NextResponse(row.suite.content, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${row.suite.filename.replace(/[^\w.-]/g, "_")}"`,
    },
  });
}
