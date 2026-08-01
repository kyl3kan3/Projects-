/**
 * The hero: the product's own output assembling in front of the visitor inside
 * five seconds (MARKETING_PLAYBOOK law 2), and the brand device — proposal →
 * contract → paid, one thread (law 3).
 *
 * It is the real chain UI with real figures from a staged demo engagement, not a
 * screenshot and not a canvas: HTML plus CSS keyframes, so it costs nothing on a
 * phone and collapses to its final state under reduced motion.
 */

const NODES = [
  {
    label: "Proposal",
    title: "Website redesign — Meridian Coffee",
    money: "$4,800",
    meta: "Accepted Jul 9",
    seal: "signed" as const,
    sealText: "Accepted",
  },
  {
    label: "Contract",
    title: "Website redesign — Meridian Coffee",
    money: "$4,800",
    meta: "Signed Jul 14 · 14:32 UTC",
    seal: "signed" as const,
    sealText: "Signed",
  },
  {
    label: "Deposit invoice",
    title: "INV-023 — 30% on signature",
    money: "$1,440",
    meta: "Paid Jul 14 · card",
    seal: "paid" as const,
    sealText: "Paid",
  },
  {
    label: "Final invoice",
    title: "INV-024 — balance on completion",
    money: "$3,360",
    meta: "Sent Aug 4 · due Aug 18",
    seal: "sent" as const,
    sealText: "Sent",
  },
];

export function HeroChain() {
  return (
    <div className="thread" aria-label="A demo chain: proposal accepted, contract signed, deposit paid, balance invoiced">
      {NODES.map((node, i) => (
        <div key={node.label} className="relative pb-4 last:pb-0">
          <span
            aria-hidden="true"
            className="absolute w-[2px]"
            style={{
              left: -21,
              top: i === 0 ? 22 : 0,
              height: i === NODES.length - 1 ? 22 : "100%",
              background:
                i === NODES.length - 1
                  ? "repeating-linear-gradient(to bottom, var(--color-text-3) 0 4px, transparent 4px 8px)"
                  : "var(--color-ink)",
              animation: `card-up 240ms var(--ease-out-quart) ${i * 160}ms both`,
            }}
          />
          <span
            aria-hidden="true"
            className="thread-node"
            data-future={i === NODES.length - 1}
            style={{ top: 22, left: -24, animation: `stitch-in 120ms var(--ease-out-quart) ${i * 160}ms both` }}
          />
          <div
            className="paper flex items-start gap-3"
            style={{ animation: `card-up 240ms var(--ease-out-quart) ${i * 160}ms both` }}
          >
            <div className="min-w-0 flex-1">
              <div className="t-label">{node.label}</div>
              <div
                className="mt-1 truncate"
                style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 17 }}
              >
                {node.title}
              </div>
              <div className="t-doc-money mt-2">{node.money}</div>
              <div className="t-meta mt-1">{node.meta}</div>
            </div>
            <span
              className="seal"
              data-variant={node.seal}
              style={
                node.seal === "paid"
                  ? { animation: `seal-press 260ms var(--ease-spring-snappy) ${i * 160 + 160}ms both` }
                  : undefined
              }
            >
              {node.sealText}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
