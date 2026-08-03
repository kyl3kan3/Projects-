/**
 * GET /api/v1/apis — what this token can reach. The CLI prints it when a
 * `--api` slug does not resolve, which turns the most common setup mistake into
 * a one-line fix.
 */

import { NextResponse, type NextRequest } from "next/server";
import { handleListApis } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const result = await handleListApis({ authorization: request.headers.get("authorization"), body: null });
  return NextResponse.json(result.body, { status: result.status });
}
