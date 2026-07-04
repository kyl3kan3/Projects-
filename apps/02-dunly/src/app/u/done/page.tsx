export default function CardUpdatedPage() {
  return (
    <main className="stationery min-h-screen">
      <div className="mx-auto max-w-md px-5 py-20 text-center">
        <div
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-full"
          style={{ border: "1.5px solid #33a06f" }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#33a06f" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 10.5 8.5 15 16 5.5" />
          </svg>
        </div>
        <h1 className="t-h2 mt-6" style={{ color: "#181d20" }}>
          You&apos;re all set
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[#4a5450]">
          Your card was updated. If a payment was pending, we&apos;re retrying it
          now — no further action needed.
        </p>
      </div>
    </main>
  );
}
