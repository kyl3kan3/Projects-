import { TabBar } from "@/components/TabBar";
import { requireOrg } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // The middleware is a cheap gate; this is the authority.
  await requireOrg();
  return (
    <>
      <div
        className="page"
        style={{
          minHeight: "100dvh",
          paddingBottom: "calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 24px)",
        }}
      >
        {children}
      </div>
      <TabBar />
    </>
  );
}
