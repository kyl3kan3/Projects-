import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listsFor } from "@/lib/lists";

/**
 * `/dashboard` is a router, not a screen: a founder's home is the list they are
 * launching. With no list yet, the only sensible destination is creating one.
 */
export default async function DashboardPage() {
  const user = await requireUser();
  const lists = await listsFor(user.id);
  const active = lists.find((l) => l.status !== "archived") ?? lists[0];
  if (!active) redirect("/lists/new?first=1");
  redirect(`/lists/${active.id}`);
}
