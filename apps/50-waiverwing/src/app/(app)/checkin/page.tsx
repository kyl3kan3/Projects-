import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { dayStatLine, todayBoard } from "@/lib/checkin";
import { featureAllowed } from "@/lib/plans";
import { CheckinBoard, type Row } from "./CheckinBoard";
import { LocationSwitcher } from "./LocationSwitcher";

export const metadata: Metadata = { title: "Check-in" };
export const dynamic = "force-dynamic";

export default async function CheckinPage() {
  const { account, location, locations } = await requireUser();
  const board = await todayBoard(location);

  const rows: Row[] = board.rows.map((r) => ({
    participantId: r.participantId,
    displayName: r.displayName,
    isMinor: r.isMinor,
    guardianName: r.guardianName,
    coverage: r.coverage,
    reason: r.reason,
    signedAt: r.signedAt?.toISOString() ?? null,
    checkedInAt: r.checkedInAt?.toISOString() ?? null,
    channel: r.channel,
  }));

  return (
    <>
      {locations.length > 1 ? (
        <LocationSwitcher locations={locations} currentId={location.id} />
      ) : null}
      <CheckinBoard
        boardRows={rows}
        timeZone={location.timezone}
        dayStat={dayStatLine(board)}
        locationName={location.name}
        qrToken={location.qrToken}
        canCheckIn={featureAllowed(account, "checkinBoard")}
      />
    </>
  );
}
