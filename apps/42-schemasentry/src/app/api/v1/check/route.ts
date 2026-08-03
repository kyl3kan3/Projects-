/**
 * POST /api/v1/check — the synchronous CI gate. The CLI's `check`.
 *
 * The engine runs inline (no queue) so a PR check completes in seconds; the
 * response carries the verdict the CLI turns into an exit code.
 */

import { NextResponse, type NextRequest } from "next/server";
import { handleCheck } from "@/lib/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "bad-request", message: "The request body was not valid JSON." },
      { status: 400 },
    );
  }
  const result = await handleCheck({ authorization: request.headers.get("authorization"), body });
  return NextResponse.json(result.body, { status: result.status });
}
