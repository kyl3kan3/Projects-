/**
 * Organization creation.
 *
 * Kept out of `auth.ts` deliberately: that module imports `next/headers` for the
 * session cookie, which makes it unusable from a plain Node process. The worker,
 * scripts, and tests all need to be able to create an org, so the logic lives
 * here and `auth.ts` calls it.
 */

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  organizationMembers,
  organizations,
  storageTargets,
  type Organization,
  type User,
} from "@/db/schema";
import { audit } from "@/lib/audit";

const TRIAL_DAYS = 14;

export async function uniqueOrgSlug(base: string): Promise<string> {
  const db = getDb();
  const root =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24) || "org";
  for (let attempt = 0; attempt < 20; attempt++) {
    const slug = attempt === 0 ? root : `${root}-${randomBytes(2).toString("hex")}`;
    const [clash] = await db.select().from(organizations).where(eq(organizations.slug, slug));
    if (!clash) return slug;
  }
  return `${root}-${randomBytes(4).toString("hex")}`;
}

/**
 * Create the organization for a brand-new user, with the managed storage target
 * already in place. Nobody should have to configure a bucket before their first
 * backup — the default has to exist for onboarding to be one screen.
 */
export async function createOrgForUser(user: User): Promise<Organization> {
  const db = getDb();
  const label = user.name?.trim() || user.email.split("@")[0];
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);

  const [org] = await db
    .insert(organizations)
    .values({
      name: `${label}'s workspace`,
      slug: await uniqueOrgSlug(label),
      ownerUserId: user.id,
      plan: "hobby",
      trialEndsAt,
      alertEmail: user.email,
    })
    .returning();

  await db.insert(organizationMembers).values({ orgId: org.id, userId: user.id, role: "owner" });

  await db.insert(storageTargets).values({
    orgId: org.id,
    name: "VaultBack managed storage",
    kind: "managed",
    bucket: "",
    prefix: org.slug,
    isDefault: true,
    verifiedAt: new Date(),
  });

  await audit({
    orgId: org.id,
    actorUserId: user.id,
    action: "org.created",
    subjectType: "organization",
    subjectId: org.id,
    metadata: { name: org.name },
  });

  return org;
}
