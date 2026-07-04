// Local notification engine: computes next ~64 triggers from regimen schedule_json
// (twice-weekly patch days, daily gel/spray, cyclical progesterone windows),
// re-registers on app open + every regimen/dose change.
// TODO: category with Taken/Skipped actions writing dose_log with app killed (Week-1 spike);
// night-sweat quick-log notification deep link for the 3 a.m. flow.
export {};
