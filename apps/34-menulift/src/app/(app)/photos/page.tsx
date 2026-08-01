import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { menuItems, menuSections } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { livePhotos, reviewQueue } from "@/lib/photos";
import { enhancerDescription } from "@/lib/photo-pipeline";
import { featureAllowed, planRequiredFor } from "@/lib/plans";
import { duration, serviceTime } from "@/lib/format";
import { LivePhotoRow, ReviewCard, UploadForm, type CardView, type DishOption } from "./PhotoUi";

export const metadata: Metadata = { title: "Photos" };

export default async function PhotosPage({
  searchParams,
}: {
  searchParams: Promise<{ approved?: string }>;
}) {
  const approved = (await searchParams).approved;
  const { organization, location } = await requireUser();
  const allowed = featureAllowed(organization.plan, "photoEnhancement");

  if (!allowed) {
    const required = planRequiredFor("photoEnhancement");
    return (
      <main className="screen" style={{ paddingTop: 24 }}>
        <h1 className="t-h2" style={{ marginTop: 0 }}>
          Dish photos
        </h1>
        <p className="t-body">
          A phone snap goes through relight and a consistent crop, and you approve the result before
          a guest ever sees it. It&apos;s on the {required.name} plan.
        </p>
        <Link href="/settings/billing" className="btn btn-primary">
          See plans
        </Link>
      </main>
    );
  }

  const db = getDb();
  const [queue, live, dishRows] = await Promise.all([
    reviewQueue(location.id),
    livePhotos(location.id),
    db
      .select({ id: menuItems.id, name: menuItems.name, sectionName: menuSections.name })
      .from(menuItems)
      .innerJoin(menuSections, eq(menuSections.id, menuItems.sectionId))
      .where(eq(menuItems.locationId, location.id))
      .orderBy(asc(menuSections.position), asc(menuItems.position)),
  ]);

  const dishes: DishOption[] = dishRows;

  const toCard = (card: (typeof queue)[number]): CardView => ({
    photoId: card.photo.id,
    itemName: card.itemName,
    sectionName: card.sectionName,
    status: card.photo.status,
    note: card.photo.note,
    error: card.photo.error,
    provider: card.photo.provider,
    originalUrl: card.originalUrl,
    enhancedUrl: card.enhancedUrl,
    caption: [
      `Shot ${serviceTime(card.photo.shotAt, location.timezone)}`,
      card.photo.enhanceMs !== null ? `enhanced in ${duration(card.photo.enhanceMs)}` : null,
      card.photo.provider ? card.photo.provider : null,
    ]
      .filter(Boolean)
      .join(" · "),
  });

  return (
    <main className="screen" style={{ paddingTop: 24 }}>
      <h1 className="t-h2" style={{ marginTop: 0, marginBottom: 8 }}>
        Dish photos
      </h1>
      <p className="t-secondary" style={{ marginTop: 0, marginBottom: 24 }}>
        {enhancerDescription()} Nothing auto-publishes.
      </p>

      {approved ? (
        <p
          className="t-body"
          role="status"
          style={{ marginTop: 0, marginBottom: 24, color: "#5f7e4e" }}
        >
          {approved} is live on the guest menu.
        </p>
      ) : null}

      <section className="hairline-b" style={{ paddingBottom: 24 }}>
        <UploadForm dishes={dishes} />
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 className="t-label" style={{ margin: 0, marginBottom: 16 }}>
          {queue.length ? `Waiting on you — ${queue.length}` : "Nothing waiting"}
        </h2>
        {queue.length === 0 ? (
          <p className="t-secondary" style={{ margin: 0 }}>
            No candidates in the queue. Shoot the three dishes guests order most first — those are the
            ones a photo moves.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 24 }}>
            {queue.map((card) => (
              <ReviewCard key={card.photo.id} card={toCard(card)} />
            ))}
          </div>
        )}
      </section>

      {live.length ? (
        <section style={{ marginTop: 40 }}>
          <h2 className="t-label" style={{ margin: 0 }}>
            Live on the menu
          </h2>
          <ul className="hairline-t" style={{ listStyle: "none", margin: "12px 0 0", padding: 0 }}>
            {live.map((card) => (
              <LivePhotoRow key={card.photo.id} card={toCard(card)} />
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
