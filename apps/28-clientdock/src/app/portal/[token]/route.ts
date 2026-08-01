import { NextResponse, type NextRequest } from "next/server";
import { consumeMagicToken, MagicLinkError } from "@/lib/magic-auth";

/**
 * Magic-link redemption. A GET, because it arrives from an email client.
 *
 * The token is claimed and burned in one statement (see consumeMagicToken), then
 * the scoped session cookie is set and the client is redirected to their portal.
 * A used, expired or revoked link lands on the portal door instead, which explains
 * itself and offers another link — never a raw error page, because the person
 * reading it is somebody's client.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  try {
    const { portal } = await consumeMagicToken(token);
    return NextResponse.redirect(new URL(`/p/${portal.slug}`, req.url));
  } catch (err) {
    if (err instanceof MagicLinkError) {
      // No slug to send them to — the token was the only thing identifying the
      // portal — so the generic door explains what happened.
      const url = new URL("/portal-expired", req.url);
      return NextResponse.redirect(url);
    }
    throw err;
  }
}
