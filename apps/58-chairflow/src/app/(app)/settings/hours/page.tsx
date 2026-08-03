import type { Metadata } from "next";
import Link from "next/link";
import { HoursForm } from "@/app/(app)/settings/SettingsForms";
import { ScreenHeader } from "@/components/ui";
import { requireStylist } from "@/lib/auth";
import { parseWorkingHours } from "@/lib/availability";
import { parseSettings } from "@/lib/cadence";

export const metadata: Metadata = { title: "Working hours" };

export default async function HoursPage() {
  const { stylist } = await requireStylist();
  const hours = parseWorkingHours(stylist.workingHours);
  const settings = parseSettings(stylist.settings);

  return (
    <>
      <ScreenHeader label="Settings" title="Working hours" />
      <p className="t-secondary" style={{ margin: "0 0 20px" }}>
        Your booking page offers slots inside these hours, minus what is already booked. A
        slot shown is a slot bookable — there is no second, looser list.
      </p>
      <HoursForm hours={hours} minNoticeMinutes={settings.minNoticeMinutes} />
      <p style={{ marginTop: 24 }}>
        <Link className="btn-quiet" href="/settings">
          Back to settings
        </Link>
      </p>
    </>
  );
}
