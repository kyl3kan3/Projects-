"""SMTP probe client: talks to the warmed-IP probe fleet; per-provider
throttle awareness; polite RCPT-check conversation; catch-all detection
(random-local-part test).
TODO: implement fleet protocol + reputation-protective backoff.
"""
