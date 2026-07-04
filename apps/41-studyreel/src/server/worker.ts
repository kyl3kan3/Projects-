/**
 * BullMQ worker: transcribe (Deepgram, diarized + word timestamps),
 * parse-slides/pdf (text + layout + page renders), align-chunk-embed
 * (pgvector), generate (retrieval-locked notes/cards/exam items via
 * src/server/grounding).
 * TODO: implement queue registration, per-queue concurrency, progress
 * events to the WS channel, dead-letter + Sentry on final failure,
 * DRY_RUN fixture mode, and per-job cost accounting (the unit-cost
 * dashboard reads this).
 */
export {};
