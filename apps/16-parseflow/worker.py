"""Celery worker: async parse jobs + webhook delivery with signed payloads
(HMAC via WEBHOOK_SIGNING_SECRET), exponential-backoff retries.
TODO: task definitions, dead-letter handling, delivery audit log.
"""
