"""API-key auth dependency + rate limiting (Redis sliding window).
TODO: constant-time key lookup, plan-based limits, 429 with Retry-After.
"""
