"""Verification pipeline stages: syntax + typo model -> DNS/MX (domain-cached)
-> disposable/role/free datasets -> provider strategy -> SMTP probe (deadline-
degraded to unknown) -> scoring.
TODO: implement stages as composable async steps with per-stage timing.
"""
