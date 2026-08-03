import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { talks } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ScreenHeader } from "@/components/ScreenHeader";
import { TalkBody } from "@/components/TalkBody";
import { PrintButton } from "./PrintButton";

export const metadata: Metadata = { title: "Talk" };

/**
 * One talk, at the body size DESIGN.md calls for: 17px at 1.6, the one
 * deliberate oversize in the portfolio, because this text is read aloud to a
 * circle of people in daylight glare.
 *
 * The print path is not decoration. A crew with a dead phone still has to be
 * able to run the talk, and offering the paper escape hatch is what makes the
 * digital version trustworthy.
 */
export default async function TalkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { company } = await requireUser();
  const db = getDb();
  const [talk] = await db
    .select()
    .from(talks)
    .where(
      and(
        eq(talks.slug, slug),
        or(isNull(talks.companyId), eq(talks.companyId, company.id)),
      ),
    );
  if (!talk) notFound();

  return (
    <main className="screen">
      <ScreenHeader
        label={`${talk.hazardTags.join(" · ")} · ${talk.estMinutes} min`}
        title={talk.title}
        back={{ href: "/talks/library", label: "Library" }}
        action={<PrintButton />}
      />
      <article className="talk-card">
        <TalkBody body={talk.bodyMd} />
      </article>
      <p className="t-secondary mt-5">
        {talk.source === "seed"
          ? "Seeded talk. Written in plain language against the federal standards; check your state plan where it differs."
          : "Your own talk, added by someone at this company."}
      </p>
    </main>
  );
}
