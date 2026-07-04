/**
 * Ingestion pipeline pieces shared by worker jobs: source lifecycle state
 * machine, transcript-slide alignment (time + lexical overlap), anchor-
 * bearing chunking (~200-400 tokens with timestamp/page+bbox anchors),
 * coverage grading (rich/thin/absent) on the course outline.
 * TODO: implement alignment scoring, chunker with anchor propagation,
 * low-confidence span marking, and coverage computation per topic.
 */

export type Coverage = "rich" | "thin" | "absent";

export async function alignAndChunk(_sourceId: string): Promise<void> {
  throw new Error("Not implemented");
}
