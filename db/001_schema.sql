-- Khoji: synthetic INR payments schema
-- Run as the Neon project owner. This migration is intentionally free of
-- provider-specific extensions so it can also be tested on local PostgreSQL.

BEGIN;

CREATE SCHEMA IF NOT EXISTS gt;

CREATE TABLE IF NOT EXISTS customers (
  customer_id  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_ref uuid NOT NULL UNIQUE,
  segment      text NOT NULL CHECK (segment IN ('retail', 'business', 'student')),
  home_city    text NOT NULL,
  created_at   timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  account_id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id  bigint REFERENCES customers(customer_id),
  account_type text NOT NULL CHECK (account_type IN ('savings', 'current', 'merchant_settlement')),
  opened_at    timestamptz NOT NULL,
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'closed'))
);

CREATE TABLE IF NOT EXISTS devices (
  device_id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_fingerprint uuid NOT NULL UNIQUE,
  platform           text NOT NULL CHECK (platform IN ('android', 'ios', 'web', 'pos', 'atm')),
  first_seen_at      timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS account_devices (
  account_id  bigint NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  device_id   bigint NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  first_seen  timestamptz NOT NULL,
  last_seen   timestamptz NOT NULL,
  PRIMARY KEY (account_id, device_id),
  CHECK (last_seen >= first_seen)
);

CREATE TABLE IF NOT EXISTS merchants (
  merchant_id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  merchant_ref  uuid NOT NULL UNIQUE,
  merchant_name text NOT NULL,
  mcc           smallint NOT NULL CHECK (mcc BETWEEN 1 AND 9999),
  city          text NOT NULL
);

CREATE TABLE IF NOT EXISTS locations (
  location_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  city        text NOT NULL,
  latitude    numeric(8,5) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude   numeric(8,5) NOT NULL CHECK (longitude BETWEEN -180 AND 180)
);

CREATE TABLE IF NOT EXISTS channels (
  channel_code smallint PRIMARY KEY,
  channel_name text NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS txn_status (
  status_code smallint PRIMARY KEY,
  status_name text NOT NULL UNIQUE,
  is_success  boolean NOT NULL
);

INSERT INTO channels(channel_code, channel_name) VALUES
  (1, 'upi_p2p'), (2, 'upi_merchant'), (3, 'card_pos'),
  (4, 'card_ecommerce'), (5, 'imps'), (6, 'neft'),
  (7, 'rtgs'), (8, 'atm')
ON CONFLICT (channel_code) DO NOTHING;

INSERT INTO txn_status(status_code, status_name, is_success) VALUES
  (1, 'success', true), (2, 'failed', false), (3, 'reversed', false), (4, 'pending', false)
ON CONFLICT (status_code) DO NOTHING;

-- The partition key appears in both unique constraints because PostgreSQL
-- requires every partitioned-table unique key to include it.
CREATE TABLE IF NOT EXISTS transactions (
  txn_id           bigint GENERATED ALWAYS AS IDENTITY,
  txn_ref          uuid NOT NULL DEFAULT uuidv7(),
  payer_account_id bigint NOT NULL REFERENCES accounts(account_id),
  payee_account_id bigint NOT NULL REFERENCES accounts(account_id),
  merchant_id      bigint REFERENCES merchants(merchant_id),
  device_id        bigint REFERENCES devices(device_id),
  location_id      bigint REFERENCES locations(location_id),
  channel_code     smallint NOT NULL REFERENCES channels(channel_code),
  status_code      smallint NOT NULL REFERENCES txn_status(status_code),
  amount_inr       numeric(14,2) NOT NULL CHECK (amount_inr > 0),
  currency         char(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  balance_before   numeric(14,2) CHECK (balance_before IS NULL OR balance_before >= 0),
  balance_after    numeric(14,2) CHECK (balance_after IS NULL OR balance_after >= 0),
  created_at       timestamptz NOT NULL,
  remarks         text,
  PRIMARY KEY (txn_id, created_at),
  UNIQUE (txn_ref, created_at),
  CHECK (payer_account_id <> payee_account_id),
  CHECK (balance_before IS NULL OR balance_after IS NULL OR balance_after <= balance_before OR status_code <> 1)
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS transactions_2026_07 PARTITION OF transactions
  FOR VALUES FROM ('2026-07-01 00:00:00+05:30') TO ('2026-08-01 00:00:00+05:30');
CREATE TABLE IF NOT EXISTS transactions_2026_08 PARTITION OF transactions
  FOR VALUES FROM ('2026-08-01 00:00:00+05:30') TO ('2026-09-01 00:00:00+05:30');
CREATE TABLE IF NOT EXISTS transactions_2026_09 PARTITION OF transactions
  FOR VALUES FROM ('2026-09-01 00:00:00+05:30') TO ('2026-10-01 00:00:00+05:30');
CREATE TABLE IF NOT EXISTS transactions_2026_10 PARTITION OF transactions
  FOR VALUES FROM ('2026-10-01 00:00:00+05:30') TO ('2026-11-01 00:00:00+05:30');
CREATE TABLE IF NOT EXISTS transactions_default PARTITION OF transactions DEFAULT;

CREATE INDEX IF NOT EXISTS transactions_payer_time_idx ON transactions (payer_account_id, created_at);
CREATE INDEX IF NOT EXISTS transactions_payee_time_idx ON transactions (payee_account_id, created_at);
CREATE INDEX IF NOT EXISTS transactions_device_time_idx ON transactions (device_id, created_at);
CREATE INDEX IF NOT EXISTS transactions_location_time_idx ON transactions (location_id, created_at);
CREATE INDEX IF NOT EXISTS transactions_failed_idx ON transactions (payer_account_id, created_at)
  WHERE status_code = 2;
CREATE INDEX IF NOT EXISTS transactions_created_brin ON transactions USING brin (created_at);

CREATE TABLE IF NOT EXISTS models (
  model_id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  model_name    text NOT NULL,
  model_version text NOT NULL,
  trained_at    timestamptz NOT NULL DEFAULT now(),
  feature_schema jsonb NOT NULL,
  artifact      jsonb NOT NULL,
  UNIQUE (model_name, model_version)
);

CREATE TABLE IF NOT EXISTS txn_scores (
  txn_id      bigint NOT NULL,
  created_at  timestamptz NOT NULL,
  model_id    bigint NOT NULL REFERENCES models(model_id),
  score       double precision NOT NULL CHECK (score BETWEEN 0 AND 1),
  reasons     jsonb NOT NULL DEFAULT '[]'::jsonb,
  scored_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (txn_id, created_at, model_id),
  FOREIGN KEY (txn_id, created_at) REFERENCES transactions(txn_id, created_at)
);

CREATE TABLE IF NOT EXISTS cases (
  case_id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject_account_id  bigint NOT NULL REFERENCES accounts(account_id),
  window_start        timestamptz NOT NULL,
  window_end          timestamptz NOT NULL,
  status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved')),
  verdict             text CHECK (verdict IN ('fraud', 'no_fraud', 'inconclusive')),
  confidence          numeric(5,4) CHECK (confidence BETWEEN 0 AND 1),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (window_end > window_start)
);

CREATE TABLE IF NOT EXISTS alerts (
  alert_id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id     bigint NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
  txn_id      bigint NOT NULL,
  created_at  timestamptz NOT NULL,
  reason      text NOT NULL,
  evidence    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by  text NOT NULL DEFAULT 'agent',
  created_at_recorded timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (txn_id, created_at) REFERENCES transactions(txn_id, created_at)
);

CREATE TABLE IF NOT EXISTS actions (
  action_id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id     bigint NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
  account_id  bigint NOT NULL REFERENCES accounts(account_id),
  action_type text NOT NULL CHECK (action_type IN ('freeze_account', 'limit_account', 'request_review')),
  parameters  jsonb NOT NULL DEFAULT '{}'::jsonb,
  status      text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'rejected', 'executed')),
  proposed_at timestamptz NOT NULL DEFAULT now(),
  decided_at  timestamptz,
  decided_by  text
);

CREATE TABLE IF NOT EXISTS audit_log (
  audit_id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id   bigint NOT NULL,
  operation   text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  actor       text NOT NULL DEFAULT current_user,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS investigation_runs (
  run_id        uuid PRIMARY KEY DEFAULT uuidv7(),
  case_id       bigint NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
  tool_name     text NOT NULL,
  input_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  error_text    text
);

CREATE TABLE IF NOT EXISTS gt.campaigns (
  campaign_id text PRIMARY KEY,
  typology    text NOT NULL,
  started_at  timestamptz NOT NULL,
  ended_at    timestamptz NOT NULL,
  params      jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (ended_at >= started_at)
);

CREATE TABLE IF NOT EXISTS gt.fraud_labels (
  txn_ref     uuid NOT NULL,
  campaign_id text NOT NULL REFERENCES gt.campaigns(campaign_id),
  txn_id      bigint,
  created_at  timestamptz,
  PRIMARY KEY (txn_ref, campaign_id)
);

COMMIT;
