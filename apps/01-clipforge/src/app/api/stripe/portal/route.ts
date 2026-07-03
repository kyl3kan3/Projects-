import { NextResponse } from "next/server";
import { currentContext } from "@/lib/auth";
import { createPortalSession } from "@/lib/billing";

export async function POST() {
  const ctx = await currentContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const url = await createPortalSession(ctx.workspace.id);
    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Portal failed" },
      { status: 500 },
    );
  }
}
