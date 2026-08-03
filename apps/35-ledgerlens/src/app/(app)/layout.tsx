import { requireUser } from "@/lib/auth";
import { SideRail, TabBar } from "@/components/TabBar";
import { forwardingAddress } from "@/lib/org";

/**
 * The signed-in shell: a bottom tab bar on a phone, a left rail from 1024px. The
 * layout resolves the session once so every screen under it can assume a user, and so
 * the rail can show which forwarding address this org owns without a second query.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { org } = await requireUser();
  return (
    <>
      <div className="mx-auto flex w-full max-w-[1120px] gap-8 px-0 lg:px-8">
        <SideRail orgName={org.name} address={forwardingAddress(org.forwardingSlug)} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      <TabBar />
    </>
  );
}
