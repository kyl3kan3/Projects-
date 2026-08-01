import { requireUser } from "@/lib/auth";
import { TabBar } from "@/components/TabBar";

/**
 * The agency shell. The guard is here as well as in middleware because
 * middleware only proves a cookie verifies — this proves the user and workspace
 * still exist.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <>
      {children}
      <TabBar />
    </>
  );
}
