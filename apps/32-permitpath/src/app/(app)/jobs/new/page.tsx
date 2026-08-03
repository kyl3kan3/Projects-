import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { IconArrowLeft } from "@/components/icons";
import { NewJobForm } from "./NewJobForm";
import { requireUser } from "@/lib/auth";
import { countActiveJobs, listOrgMembers } from "@/lib/jobs";
import { listJurisdictions } from "@/lib/jurisdictions";
import { checkActiveJobs } from "@/lib/plans";

export const metadata: Metadata = { title: "New job" };

export default async function NewJobPage() {
  const { org } = await requireUser();
  const used = await countActiveJobs(org.id);
  const gate = checkActiveJobs(org.plan, used);
  // The limit is enforced in the action too; this keeps a blocked user out of a
  // form they cannot submit rather than letting them type it all first.
  if (!gate.allowed) redirect("/settings/billing?blocked=jobs");

  const [list, members] = await Promise.all([
    listJurisdictions({ organizationId: org.id }),
    listOrgMembers(org.id),
  ]);

  return (
    <main className="screen pt-6">
      <Link href="/jobs" className="btn-quiet btn-quiet-sm">
        <IconArrowLeft size={18} />
        Jobs
      </Link>

      <h1 className="t-h2 mt-4">New job checklist</h1>
      <p className="t-secondary mt-2">
        The checklist is pinned to the requirement version current right now, so a later rule change
        never rewrites this job behind your back.
      </p>

      <div className="mt-6">
        <NewJobForm
          options={list.map((item) => ({
            id: item.jurisdiction.id,
            name: item.jurisdiction.name,
            departmentName: item.jurisdiction.departmentName,
            coverage: item.jurisdiction.coverageStatus,
            recordCount: item.recordCount,
          }))}
          members={members.map((m) => ({ id: m.id, name: m.name }))}
        />
      </div>
    </main>
  );
}
