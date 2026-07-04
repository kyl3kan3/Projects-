"use client";

export default function Error({ reset }: { reset: () => void }) {
  return (
    <main className="screen">
      <div className="shell">
        <div className="panel p-5">
          <p className="t-label">Dunly could not load</p>
          <h1 className="t-h2 mt-3">The recovery ledger hit an error.</h1>
          <p className="t-secondary mt-2">Retry the screen. No retries or messages are sent from this error state.</p>
          <button className="btn btn-primary mt-5" onClick={reset} type="button">
            Retry
          </button>
        </div>
      </div>
    </main>
  );
}
