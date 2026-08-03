/**
 * POST /api/v1/specs — record a deploy. The CLI's `push`.
 *
 * A ten-line adapter over `handlePush` in `src/lib/service.ts`, which is also
 * what the Fastify server mounts. There is no logic here worth testing twice.
 */

import { NextResponse, type NextRequest } from "next/server";
import { handlePush } from "@/lib/service";

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
  const result = await handlePush({ authorization: request.headers.get("authorization"), body });
  return NextResponse.json(result.body, { status: result.status });
}
