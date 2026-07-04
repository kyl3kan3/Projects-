export default function Loading() {
  return (
    <main className="screen">
      <div className="shell">
        <div className="panel p-5">
          <p className="t-label">Loading Dunly</p>
          <h1 className="t-h2 mt-3">Preparing the recovery ledger.</h1>
          <p className="t-secondary mt-2">Webhook, retry, and message state will appear as soon as the screen is ready.</p>
        </div>
      </div>
    </main>
  );
}
