/**
 * The dashboard shell. The header and the tab bar are rendered per-screen
 * rather than here, because the tab bar is scoped to one API and the API list
 * has no API selected — a shell that always showed the tabs would show them
 * pointing nowhere.
 */

import { requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Every screen under this segment requires a session. Resolving it here means
  // an expired cookie redirects once, at the top, instead of per page.
  await requireUser();
  return <>{children}</>;
}
