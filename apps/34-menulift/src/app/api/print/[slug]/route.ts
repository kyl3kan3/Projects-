/**
 * Printables: the table tent, the window card, and the raw QR SVG.
 *
 * Requires an owner session for the location — a printable is a small thing to
 * generate, but generating them for anyone's slug turns this into a free PDF
 * factory pointed at other people's restaurants.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { locations } from "@/db/schema";
import { currentContext } from "@/lib/auth";
import { loadPublicMenuFresh } from "@/lib/menu-data";
import { PRINT_SIZES, menuUrl, printPackPdf, printablePdf, qrSvg, type PrintFormat } from "@/lib/qr";

export const runtime = "nodejs";

function isPrintFormat(value: string): value is PrintFormat {
  return value === "table_tent" || value === "window_card";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;
  const db = getDb();
  const [location] = await db.select().from(locations).where(eq(locations.slug, slug));
  if (!location) return new Response("Not found", { status: 404 });

  const ctx = await currentContext(location.id);
  if (!ctx || ctx.organization.id !== location.organizationId) {
    return new Response("Not found", { status: 404 });
  }

  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "pack";
  const menuKey = url.searchParams.get("menu");

  let menuName: string | null = null;
  if (menuKey) {
    const payload = await loadPublicMenuFresh(slug);
    const menu = payload?.menus.find((m) => m.key === menuKey);
    if (!menu) return new Response("Unknown menu", { status: 404 });
    menuName = menu.name;
  }

  const target = menuUrl(slug, menuKey);
  const options = {
    restaurantName: location.name,
    url: target,
    menuName,
    footnote: location.address,
  };

  if (format === "svg") {
    return new Response(qrSvg(target, { sizePx: 1024, margin: 4 }), {
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        "content-disposition": `attachment; filename="${slug}-qr.svg"`,
        "cache-control": "no-store",
      },
    });
  }

  const bytes =
    format === "pack"
      ? printPackPdf(options)
      : isPrintFormat(format)
        ? printablePdf(format, options)
        : null;
  if (!bytes) {
    return new Response(
      `Unknown format "${format}". Use pack, table_tent, window_card, or svg.`,
      { status: 400 },
    );
  }

  const label =
    format === "pack" ? "print-pack" : PRINT_SIZES[format as PrintFormat].label.split(",")[0];
  return new Response(bytes.slice().buffer as ArrayBuffer, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${slug}-${label.toLowerCase().replace(/\s+/g, "-")}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
