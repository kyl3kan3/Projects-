import { requireSession } from "@/lib/auth";
import { Rail, TabBar } from "@/components/TabBar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  return (
    <div className="min-h-screen">
      <Rail />
      <div className="pb-24 lg:pb-8 lg:pl-52">
        <div className="mx-auto max-w-[1120px]">{children}</div>
      </div>
      <TabBar />
    </div>
  );
}
