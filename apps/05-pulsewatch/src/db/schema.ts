/**
 * Drizzle schema for PulseWatch.
 *
 * Entities: users, teams, monitors (http/tcp/ping/cron), check_results,
 * incidents, alert_channels, alert_rules, status_pages, subscriptions.
 *
 * TODO:
 * - [ ] monitors: type, target, interval, regions[], expected assertions
 * - [ ] check_results: partitioned/rolled-up storage plan (raw 30d, hourly 1y)
 * - [ ] incidents: open/ack/resolved lifecycle with timeline events
 */
export {};
