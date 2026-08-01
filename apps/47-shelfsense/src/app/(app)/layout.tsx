import { requireShop } from "@/lib/auth";
import { SideRail, TabBar } from "@/components/TabBar";
import { shopHandle } from "@/lib/format";

/**
 * The signed-in shell. Bottom tab bar on phones, persistent left rail from 1024px,
 * per DESIGN.md's responsive rules.
 *
 * Every screen in this group needs a connected shop, so the guard lives here:
 * middleware redirects an unauthenticated request, this redirects a merchant with no
 * shop to the connect screen rather than showing them an empty dashboard they have
 * no way to fill.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { shop } = await requireShop();

  return (
    <div className="lg:mx-auto lg:flex lg:max-w-[1224px] lg:gap-8 lg:px-8">
      <SideRail shopLabel={shopHandle(shop.shopifyDomain)} />
      <div className="min-w-0 flex-1">{children}</div>
      <TabBar />
    </div>
  );
}
