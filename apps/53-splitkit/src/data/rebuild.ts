// Bundled post-decree rebuild plan — sequenced tasks across categories:
// credit (report pull, joint-account closure, secured card if needed),
// retitling (house, vehicles), beneficiaries (retirement accounts, life
// insurance, will/estate documents), name change, insurance re-shop. Activated
// when stage = post_decree. Task copy is work, not advice.
//
// TODO:
// - [ ] RebuildTask interface: key, category, title, detail, suggestedOffsetDays?
// - [ ] Author the full task set with reviewed copy (Phase 0)
// - [ ] Stable keys (rebuild_status rows reference them)
export {};
