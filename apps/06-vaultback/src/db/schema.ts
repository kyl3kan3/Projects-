/**
 * Drizzle schema for VaultBack control plane.
 *
 * Entities: users, orgs, database_connections (provider, encrypted creds),
 * backup_policies (schedule, retention), backup_runs, restore_drills,
 * storage_targets (ours vs BYO bucket), notifications, subscriptions.
 *
 * TODO:
 * - [ ] encrypted-at-rest connection credentials (envelope encryption)
 * - [ ] backup_runs: size, duration, checksum, storage key, status
 * - [ ] retention policy fields (daily/weekly/monthly keep counts)
 */
export {};
