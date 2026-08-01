// TEMPORARY verification harness — deleted before hand-off.
import type { NextRequest } from "next/server";
import { connectDatabaseAction, savePolicyAction } from "@/app/(app)/vault/actions";
import { restoreAction } from "@/app/(app)/restore/actions";
import { signupAction, loginAction } from "@/app/(auth)/actions";
import { saveOrgAction } from "@/app/(app)/settings/actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function fd(obj: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.append(k, v);
  return f;
}

export async function POST(req: NextRequest): Promise<Response> {
  const body = (await req.json()) as { which: string; fields: Record<string, string> };
  const form = fd(body.fields);
  try {
    let out: unknown;
    switch (body.which) {
      case "signup": out = await signupAction({}, form); break;
      case "login": out = await loginAction({}, form); break;
      case "connect": out = await connectDatabaseAction({}, form); break;
      case "policy": out = await savePolicyAction({}, form); break;
      case "restore": out = await restoreAction({}, form); break;
      case "org": out = await saveOrgAction({}, form); break;
      default: return Response.json({ error: "unknown" }, { status: 400 });
    }
    return Response.json({ ok: true, out });
  } catch (err) {
    const digest = (err as { digest?: string })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      return Response.json({ ok: true, redirect: digest });
    }
    return Response.json({ ok: false, error: String(err) }, { status: 200 });
  }
}
