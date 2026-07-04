import { BottomNav, DesktopRail } from "@/components/bottom-nav";
import { SequenceEditor } from "@/components/sequence-editor";
import { TopBar } from "@/components/top-bar";
import { getCampaignPerformance } from "@/lib/analytics";
import { formatMoney, percent } from "@/lib/format";
import { sequenceSteps } from "@/lib/sample-data";

export default function SequencesPage() {
  const performance = getCampaignPerformance();

  return (
    <main className="screen">
      <div className="shell with-rail">
        <DesktopRail active="/sequences" />
        <div>
          <TopBar />
          <section className="mb-6">
            <p className="t-label">Sequences</p>
            <h1 className="t-h2 mt-2">Default dunning campaign</h1>
            <p className="t-secondary mt-2 max-w-[56ch]">
              Email steps are live on every plan. SMS appears in Growth and above, and only sends when customer consent
              exists.
            </p>
          </section>

          <div className="app-grid">
            <SequenceEditor steps={sequenceSteps} />
            <aside className="space-y-3">
              {performance.map((item) => (
                <div key={item.name} className="panel p-4">
                  <p className="t-label">{item.name}</p>
                  <p className="money mt-3 text-2xl text-[var(--color-banknote)]">{formatMoney(item.recoveredCents)}</p>
                  <p className="t-secondary mt-2">
                    {percent(item.recoveryRate)} recovery - {item.messagesSent} messages
                  </p>
                </div>
              ))}
            </aside>
          </div>
        </div>
      </div>
      <BottomNav active="/sequences" />
    </main>
  );
}
