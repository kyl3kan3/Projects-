CREATE TABLE IF NOT EXISTS provider_webhook_receipts (
  id text PRIMARY KEY,
  received_at timestamp NOT NULL DEFAULT now()
);
