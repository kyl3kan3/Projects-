import type { TimelineNode } from "@/lib/sample-data";

export function RetryTimeline({ nodes }: { nodes: TimelineNode[] }) {
  return (
    <div className="timeline" aria-label="Retry timeline">
      {nodes.map((node) => (
        <div key={`${node.label}-${node.date}`} className="timeline-node">
          <span className={`timeline-dot ${node.state}`} />
          <div>{node.date}</div>
        </div>
      ))}
    </div>
  );
}
