/**
 * Provider adapters: how to reach each hosted-Postgres flavor.
 *
 * TODO:
 * - [ ] connection-string validation + least-privilege role guidance per provider
 * - [ ] provider quirks (PlanetScale = MySQL -> mysqldump path; branch DBs on Neon)
 * - [ ] connectivity test used during onboarding
 */
export type Provider = "supabase" | "neon" | "planetscale" | "railway" | "generic";
