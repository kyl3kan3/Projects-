import type { Metadata } from "next";
import { ScreenHeader } from "@/components/ScreenHeader";
import { requireOnboardedUser } from "@/lib/auth";
import { NewJobForm } from "./NewJobForm";
import { quotaLine } from "@/lib/walkthroughs";

export const metadata: Metadata = { title: "New walkthrough" };
export const dynamic = "force-dynamic";

export default async function NewJobPage() {
  const { org } = await requireOnboardedUser();
  return (
    <main>
      <ScreenHeader
        title="New walkthrough"
        meta={quotaLine(org)}
        backHref="/jobs"
        backLabel="Jobs"
        showSettings={false}
      />
      <div className="gutter">
        <NewJobForm />
      </div>
    </main>
  );
}
