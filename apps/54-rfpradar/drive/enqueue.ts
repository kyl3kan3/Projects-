import "@/lib/load-env";
import { closeQueues, enqueue, QUEUES } from "@/lib/queue";
async function main() {
  const ok = await enqueue(QUEUES.refreshStaleness, "manual-probe", {});
  console.log("enqueued:", ok);
  await closeQueues();
}
void main();
