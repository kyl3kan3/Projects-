import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { IconChevronLeft } from "@/components/icons";
import { ProfileForm } from "../SettingsForms";

export const metadata: Metadata = { title: "Organization profile" };
export const dynamic = "force-dynamic";

export default async function ProfileSettingsPage() {
  const { org } = await requireUser();

  return (
    <div className="screen">
      <div className="pt-6">
        <Link href="/settings" className="btn-quiet" style={{ minHeight: 44 }}>
          <IconChevronLeft size={18} />
          Settings
        </Link>
      </div>

      <header className="rule-b pb-4 pt-2">
        <h1 className="t-h2">Organization profile</h1>
        <p className="t-secondary mt-2">
          This is what fit scoring compares each funder against, and what the answer
          library starts from. Nothing here is shared with funders.
        </p>
      </header>

      <div className="pt-6">
        <ProfileForm
          values={{
            name: org.name,
            mission: org.profile.mission,
            programs: org.profile.programs,
            budgetBand: org.profile.budgetBand,
            serviceStates: org.profile.serviceStates,
            causeCodes: org.profile.causeCodes,
            ein: org.profile.ein,
            typicalAsk: org.profile.typicalAskCents
              ? String(Math.round(org.profile.typicalAskCents / 100))
              : "",
          }}
        />
      </div>
    </div>
  );
}
