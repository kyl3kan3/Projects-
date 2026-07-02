/**
 * Nightly rank-check worker: fan-out per plan frequency, batched DataForSEO
 * tasks, position + SERP-feature persistence, alert evaluation, rollups.
 * TODO: implement; batch by location/device to minimize cost; retry with
 * backoff on API errors; never double-bill a check cycle.
 */
export {};
