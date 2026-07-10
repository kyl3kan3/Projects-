"use client";
/** Client proofing grid: 2-col masonry, tap to favorite (brass corner tick),
 *  selection count. Images are art-directed gradient stand-ins for the demo. */
import { useState } from "react";
import { IconHeart } from "@/components/icons";

interface Img { id: string; ratio: number; tone: number; }
export function ProofGallery({ galleryId, images, visitor, initialFavs }: { galleryId: string; images: Img[]; visitor: string; initialFavs: string[] }) {
  const [favs, setFavs] = useState<Set<string>>(new Set(initialFavs));
  async function toggle(id: string) {
    const next = new Set(favs);
    const has = next.has(id);
    if (has) next.delete(id); else next.add(id);
    setFavs(next);
    await fetch("/api/public/proof", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ galleryId, galleryImageId: id, visitor }) }).catch(() => {});
  }
  const cols: Img[][] = [[], []];
  images.forEach((im, i) => cols[i % 2].push(im));
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <span className="t-placard" style={{ color: "#6b6a63" }}>{images.length} photographs</span>
        <span className="mono" style={{ color: "#1b1b19" }}>{favs.size} favorited</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {cols.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-2">
            {col.map((im) => {
              const fav = favs.has(im.id);
              const h = Math.round(160 * im.ratio);
              return (
                <button key={im.id} onClick={() => toggle(im.id)} className="relative block w-full overflow-hidden" style={{ height: h, background: `linear-gradient(${140 + im.tone * 12}deg, hsl(${28 + im.tone * 6} 18% ${72 - im.tone * 4}%), hsl(${20 + im.tone * 4} 14% ${58 - im.tone * 3}%))` }}>
                  {fav && <span className="fav-tick"><IconHeart size={14} /></span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
