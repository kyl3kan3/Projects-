import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JoinedView } from "@/components/JoinedView";
import { listByDomain } from "@/lib/lists";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "You're in line",
  robots: { index: false, follow: false },
};

export default async function CustomDomainJoinedPage({
  params,
}: {
  params: Promise<{ host: string; code: string }>;
}) {
  const { host, code } = await params;
  const list = await listByDomain(decodeURIComponent(host));
  if (!list) notFound();
  return <JoinedView code={code} expectListId={list.id} />;
}
