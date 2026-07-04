import { BottomNav, DesktopRail } from "@/components/bottom-nav";
import { RoiStatement } from "@/components/roi-statement";
import { TopBar } from "@/components/top-bar";

export default function StatementPage() {
  return (
    <main className="screen">
      <div className="shell with-rail">
        <DesktopRail active="/dashboard" />
        <div>
          <TopBar />
          <RoiStatement />
        </div>
      </div>
      <BottomNav active="/dashboard" />
    </main>
  );
}
