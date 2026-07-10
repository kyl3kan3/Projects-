import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { proofSummary } from "@/lib/galleries";
import { IconChevronLeft, IconHeart } from "@/components/icons";

export const dynamic = "force-dynamic";
export default async function GalleryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const gallery = await db.query.galleries.findFirst({ where: and(eq(schema.galleries.id, id), eq(schema.galleries.accountId, session.accountId)) });
  if (!gallery) notFound();
  const images = await db.query.galleryImages.findMany({ where: eq(schema.galleryImages.galleryId, gallery.id), orderBy: asc(schema.galleryImages.sortOrder) });
  const proof = await proofSummary(gallery.id);
  const favIds = new Set((await db.query.imageSelections.findMany({ where: and(eq(schema.imageSelections.galleryId, gallery.id), eq(schema.imageSelections.selectionSet, "favorites")) })).map((s) => s.galleryImageId));

  return (
    <main className="px-5 pt-6 pb-8">
      <Link href="/galleries" className="btn-quiet inline-flex items-center gap-1 px-0"><IconChevronLeft size={18} /> Galleries</Link>
      <h1 className="t-h2 mt-3">{gallery.name}</h1>
      <div className="mt-2 flex items-center gap-3">
        <span className={`pill ${gallery.status === "published" ? "pill-fern" : "pill-brass"}`}><span className="dot" />{gallery.status.toUpperCase()}</span>
        <span className="mono text-[var(--color-text-2)] flex items-center gap-1"><IconHeart size={14} className="text-[var(--color-brass)]" />{proof.favorites} favorited</span>
      </div>
      {gallery.status === "published" && (
        <Link href={`/gallery/${gallery.slug}`} className="btn btn-secondary btn-sm mt-3 inline-flex">View client gallery →</Link>
      )}
      <div className="mt-5 grid grid-cols-3 gap-2">
        {images.map((im, i) => (
          <div key={im.id} className="relative" style={{ paddingBottom: `${(im.height ?? 1333) / (im.width ?? 2000) * 100}%`, background: `linear-gradient(${135 + i * 7}deg, hsl(${28 + (i % 5) * 6} 16% 30%), hsl(${22 + (i % 4) * 4} 18% 18%))` }}>
            {favIds.has(im.id) && <span className="fav-tick"><IconHeart size={13} /></span>}
          </div>
        ))}
        {images.length === 0 && <p className="t-secondary col-span-3 py-8">No photographs uploaded yet.</p>}
      </div>
      {gallery.status === "draft" && (
        <div className="fixed inset-x-0 bottom-16 z-40 px-5 lg:static lg:mt-6 lg:px-0">
          <button className="btn btn-primary btn-block">Deliver gallery</button>
        </div>
      )}
    </main>
  );
}
