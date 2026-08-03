/**
 * The Diff tab lands on the newest diff. When there is none yet it says why
 * rather than showing an empty screen with no explanation.
 */

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getApiBySlug, getLatestDiffId } from "@/lib/queries";
import { AppHeader, ScreenTitle } from "@/components/ScreenHeader";
import { TabBar } from "@/components/TabBar";
import { TerminalBlock } from "@/components/CopyMono";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: `${slug} — diff` };
}

export default async function LatestDiffPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { org } = await requireUser();
  const api = await getApiBySlug(org.id, slug);
  if (!api) notFound();

  const latest = await getLatestDiffId(api.id);
  if (latest) redirect(`/apis/${api.slug}/diffs/${latest}`);

  return (
    <>
      <AppHeader apiName={api.name} apiSlug={api.slug} />
      <main className="screen gutter" style={{ paddingTop: 24 }}>
        <div className="wrap" style={{ maxWidth: 720 }}>
          <ScreenTitle
            title="No diff yet"
            subtitle="A diff needs two deploys. The first push becomes the baseline; the second produces a verdict."
          />
          <TerminalBlock
            command={`npx schemasentry push openapi.yaml --api ${api.slug} --version $GIT_SHA`}
            note="Or select any two deploys on the timeline and compare them."
          />
        </div>
      </main>
      <TabBar slug={api.slug} />
    </>
  );
}
