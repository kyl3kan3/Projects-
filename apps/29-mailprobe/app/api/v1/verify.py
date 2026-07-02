"""POST /v1/verify — single-address verification.

TODO:
- [ ] cache lookup -> pipeline -> verdict {deliverable|undeliverable|risky|unknown}
- [ ] signals: catch_all, disposable, role, free_provider, typo_suggestion
- [ ] confidence 0-100 with reasons[] — honest unknowns, never fake certainty
- [ ] metering hook per billable result
"""
