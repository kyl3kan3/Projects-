/**
 * Probe worker: executes checks from the queue, one instance per region.
 *
 * TODO:
 * - [ ] HTTP checks: status/latency/body+header assertions, redirects, timeout
 * - [ ] TCP + ping checks
 * - [ ] SSL cert + domain expiry checks (daily)
 * - [ ] cron heartbeat: mark missed when ping doesn't arrive within grace
 * - [ ] report results to API with PROBE_API_TOKEN auth
 * - [ ] N-confirmation before opening an incident (avoid single-region flaps)
 */
export {};
