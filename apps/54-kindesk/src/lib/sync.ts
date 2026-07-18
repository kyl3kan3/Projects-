// E2E sync engine: encrypt changed records client-side (key derived from the share
// code via expo-crypto), push/pull opaque blobs to the Cloudflare Worker relay,
// last-write-wins per record. The relay never sees plaintext — that is the promise.
// TODO: push/pull/join, blob sync for documents, foreground triggers, offline queue.
export {};
