import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ownedList } from "@/lib/lists";
import { segmentSize } from "@/lib/blasts";
import { featureAllowed } from "@/lib/plans";
import { ListHeader } from "@/components/ListHeader";
import { BlastForm } from "./BlastForm";
import { IconChevronLeft } from "@/components/icons";

export const metadata: Metadata = { title: "Write a blast" };
export const dynamic = "force-dynamic";

export default async function NewBlastPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const list = await ownedList(user.id, (await params).id);
  if (!list) notFound();
  if (!featureAllowed(user.plan, "emailBlasts")) redirect(`/lists/${list.id}/blasts`);

  const [all, topReferrers, rewardTier] = await Promise.all([
    segmentSize(list.id, { segment: "all", value: 0 }),
    segmentSize(list.id, { segment: "top_referrers", value: 50 }),
    segmentSize(list.id, { segment: "reward_tier", value: 3 }),
  ]);

  return (
    <main className="screen">
      <ListHeader
        list={list}
        section="New blast"
        detail={
          <Link href={`/lists/${list.id}/blasts`} className="btn-quiet" style={{ display: "inline-flex", gap: 4 }}>
            <IconChevronLeft size={18} />
            All blasts
          </Link>
        }
      />
      <BlastForm
        listId={list.id}
        productName={list.name}
        segmentCounts={{ all, topReferrers, rewardTier }}
      />
    </main>
  );
}
