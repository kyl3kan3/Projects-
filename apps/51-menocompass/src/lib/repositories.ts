// Repository layer — all SQL lives here; stores/screens never touch the db directly.
// TODO: checkins (upsert per symptom/date, yesterday-prefill query), cycles (events + gap series;
// never predictions), meds (medication+regimen CRUD, dose-change = close+open regimen rows),
// doseLog, labs, healthSamples, settings; derived aggregates for trends/insights/report.
export {};
