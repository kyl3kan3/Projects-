"""Celery worker: bulk verification fan-out, webhook delivery (signed),
dataset refresh (disposable domains), retention sweeper.
TODO: implement tasks with per-domain politeness caps.
"""
