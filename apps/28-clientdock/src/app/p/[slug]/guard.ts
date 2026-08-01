import { notFound, redirect } from "next/navigation";
import { resolveViewer, type PortalViewer } from "@/lib/portal-access";
import type { ModuleId } from "@/db/schema";

/**
 * The guard every module screen starts with.
 *
 * Three outcomes, and only three: the slug names nothing (404), the viewer has no
 * signed access or the module is switched off (back to the portal door, which
 * explains itself), or a viewer whose `portalId` came out of a signature check.
 *
 * A module that is off sends the client home rather than rendering an empty room:
 * off means the data is not loaded at all.
 */
export async function requirePortalModule(slug: string, moduleId: ModuleId): Promise<PortalViewer> {
  const resolved = await resolveViewer(slug);
  if (resolved.kind === "not-found") notFound();
  if (resolved.kind !== "viewer") redirect(`/p/${slug}`);
  if (!(resolved.viewer.portal.enabledModules as ModuleId[]).includes(moduleId)) {
    redirect(`/p/${slug}`);
  }
  return resolved.viewer;
}
