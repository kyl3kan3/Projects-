/**
 * The grounding core: retrieval-locked generation + the verification pass.
 * No passage, no item — generation receives ONLY retrieved chunks; a second
 * entailment check discards any item whose answer is not supported by its
 * cited chunks. Discard, never repair into vagueness.
 * TODO: implement retrieve(courseId, topicId, query) over pgvector,
 * generateCards/generateNotes/generateExamItems with citation_chunk_ids
 * threading, verifyEntailment(item, chunks), MCQ distractor non-entailment
 * check, and benchmark harness hooks (the 150-pair yardstick).
 */

export interface GroundedItem {
  text: string;
  citationChunkIds: number[];
}

export async function verifyEntailment(_item: GroundedItem): Promise<boolean> {
  throw new Error("Not implemented");
}
