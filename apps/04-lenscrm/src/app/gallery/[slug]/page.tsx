import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ProofGallery } from "@/components/ProofGallery";
import { Aperture } from "@/components/icons";

export const dynamic = "force-dynamic";

/** The client gallery — the money screen. Paper ground, the client's work as
 *  hero. Must be beautiful enough that clients ask who built it. */
export default async function ClientGalleryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const gallery = await db.query.galleries.findFirst({ where: eq(schema.galleries.slug, slug) });
  if (!gallery || gallery.status !== "published") notFound();
  const account = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, gallery.accountId) });
  const images = await db.query.galleryImages.findMany({ where: and(eq(schema.galleryImages.galleryId, gallery.id), eq(schema.galleryImages.processStatus, "ready")), orderBy: asc(schema.galleryImages.sortOrder) });

  // Demo visitor id (real app gates by email/token).
  const visitor = "preview-visitor";
  const favs = (await db.query.imageSelections.findMany({ where: and(eq(schema.imageSelections.galleryId, gallery.id), eq(schema.imageSelections.selectedBy, visitor), eq(schema.imageSelections.selectionSet, "favorites")) })).map((s) => s.galleryImageId);

  return (
    <main className="paper-ground min-h-screen">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <Aperture size={24} stroke="#1b1b19" />
          <span className="font-semibold" style={{ color: "#1b1b19" }}>{account?.name}</span>
          <h1 className="t-display mt-2" style={{ fontSize: "clamp(28px, 8vw, 46px)", color: "#1b1b19" }}>{gallery.name}</h1>
        </div>
        <ProofGallery
          galleryId={gallery.id}
          visitor={visitor}
          initialFavs={favs}
          images={images.map((im, i) => ({ id: im.id, ratio: (im.height ?? 1333) / (im.width ?? 2000), tone: i % 6 }))}
        />
        <p className="mt-10 text-center text-[11px] uppercase tracking-[0.08em]" style={{ color: "#9a978d" }}>Galleries by LensCRM</p>
      </div>
    </main>
  );
}
