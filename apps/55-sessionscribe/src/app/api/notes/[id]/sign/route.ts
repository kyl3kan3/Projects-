/**
 * src/app/api/notes/[id]/sign/route.ts
 *
 * The sign gate endpoint. The ONLY path by which a note becomes signed.
 *
 * TODO:
 * - [ ] POST: requirePractice(); verify the signer owns the note (or is
 *       its supervisor for kind=cosign).
 * - [ ] Delegate to src/lib/signing.signNote() — single transaction:
 *       version snapshot + signatures row + status flips + audit event.
 * - [ ] Reject signing a note with zero reviewed content, and reject any
 *       attempt against an already-signed version (409).
 * - [ ] Response carries {version, contentHash, signedAt} for the sign &
 *       lock animation's hash-stamp beat.
 */

export async function POST(
  _req: Request,
  _ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  // TODO: implement per ARCHITECTURE.md key flow 2
  return new Response("Not implemented", { status: 501 });
}
