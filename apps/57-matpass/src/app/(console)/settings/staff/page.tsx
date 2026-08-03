import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { Pill, ScreenTitle, SectionHead } from "@/components/ui";
import { requireSchool, roleLabel } from "@/lib/auth";
import { StaffForm } from "./StaffForm";

export const metadata: Metadata = { title: "Staff" };

export default async function StaffPage() {
  const { school, user } = await requireSchool();
  const db = getDb();
  const staff = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.schoolId, school.id))
    .orderBy(asc(users.name));

  return (
    <main className="screen">
      <ScreenTitle
        eyebrow="Who can do what"
        title="Staff accounts"
        action={
          <Link href="/settings" className="btn-quiet">
            Settings
          </Link>
        }
      />
      <p className="t-secondary">
        The owner handles billing and staff. Instructors change the curriculum and record promotions.
        The front desk checks students in, works retention flags and sends announcements — everything
        the floor needs and nothing that rewrites a record.
      </p>

      <SectionHead>{staff.length} account{staff.length === 1 ? "" : "s"}</SectionHead>
      <div>
        {staff.map((member) => (
          <div key={member.id} className="row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="t-title">{member.name}</p>
              <p className="t-secondary fg-3" style={{ marginTop: 2 }}>
                {member.email}
              </p>
            </div>
            <Pill tone={member.role === "owner" ? "eligible" : "quiet"}>
              {roleLabel(member.role)}
            </Pill>
          </div>
        ))}
      </div>

      <StaffForm canManage={user.role === "owner"} />
    </main>
  );
}
