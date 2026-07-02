/**
 * Session server (Fastify + WebSocket): orchestrates STT -> LLM -> TTS
 * streaming loop per session; server-side entitlement + fair-use checks.
 * TODO: implement session state machine (listening/thinking/speaking),
 * end-of-utterance detection, latency budget instrumentation.
 */
export {};
