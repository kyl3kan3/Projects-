import type { Metadata } from "next";
import { JoinedView } from "@/components/JoinedView";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `You're in line for ${slug}`,
    // Never indexed: a position page is personal, and a crawler following share
    // links would put strangers' positions into search results.
    robots: { index: false, follow: false },
  };
}

export default async function JoinedPage({
  params,
}: {
  params: Promise<{ slug: string; code: string }>;
}) {
  const { slug, code } = await params;
  return <JoinedView code={code} expectSlug={slug} />;
}
