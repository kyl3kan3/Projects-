import { TabBar } from "@/components/TabBar";
import { requireOnboardedUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // The middleware is a cheap cookie gate; this is the authority.
  await requireOnboardedUser();
  return (
    <>
      <div
        style={{
          minHeight: "100dvh",
          paddingBottom: "calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 88px)",
        }}
      >
        {children}
      </div>
      <TabBar />
    </>
  );
}
