/**
 * src/app/api/notes/[id]/sign/route.ts
 *
 * The sign gate endpoint — the only path by which a note becomes signed.
 *
 * It does three things and nothing else: prove the signer owns the note, prove
 * they typed their own credentials (the ritual, not a security control — the
 * session cookie is the credential), and delegate to `lib/signing.signNote`,
 * which is the single transaction that writes the version snapshot, the
 * signature row and the status flips together.
 *
 * The response carries `{version, contentHash, signedAt}` because the sign & lock
 * animation's second beat is the hash stamping in, and the client cannot invent it.
 */

import { NextResponse } from "next/server";
import { currentContext } from "@/lib/auth";
import { noteContext } from "@/lib/sessions";
import { EmptyNoteError, SignedNoteError, signNote } from "@/lib/signing";
import { requestMeta } from "@/lib/request";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctxParams: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await currentContext();
  if (!auth) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctxParams.params;

  const ctx = await noteContext(auth.practice.id, id);
  if (!ctx) return NextResponse.json({ error: "Note not found" }, { status: 404 });
  if (ctx.note.status === "signed") {
    return NextResponse.json(
      { error: "That note is already signed and locked." },
      { status: 409 },
    );
  }

  const body = (await req.json().catch(() => null)) as { credentials?: string } | null;
  const typed = (body?.credentials ?? "").trim();
  const expected = (auth.user.credentials || auth.user.name).trim();
  if (typed.toLowerCase() !== expected.toLowerCase()) {
    return NextResponse.json(
      {
        error: `Type your credentials exactly as they appear on your signature: ${expected}`,
      },
      { status: 400 },
    );
  }

  const meta = await requestMeta();
  try {
    const result = await signNote(id, auth.user.id, meta);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof EmptyNoteError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof SignedNoteError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("[api/notes/sign] failed", err);
    return NextResponse.json({ error: "Could not sign that note" }, { status: 500 });
  }
}
