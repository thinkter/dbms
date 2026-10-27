-- Feature views used by both offline training and online investigation.
BEGIN;

CREATE OR REPLACE VIEW v_txn_features AS
WITH base AS (
  SELECT
    t.*,
    t.created_at AT TIME ZONE 'Asia/Kolkata' AS created_at_ist,
    first_value(t.created_at) OVER (
      PARTITION BY t.payer_account_id ORDER BY t.created_at
      ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    ) AS payer_first_seen_at
  FROM transactions t
)
SELECT
  b.txn_id, b.txn_ref, b.created_at, b.payer_account_id, b.payee_account_id,
  b.device_id, b.channel_code, b.status_code, b.amount_inr, b.location_id,
  EXTRACT(HOUR FROM b.created_at_ist)::smallint AS hour_ist,
  (EXTRACT(ISODOW FROM b.created_at_ist)::smallint IN (6, 7)) AS is_weekend,
  count(*) OVER w_1h AS payer_txn_count_1h,
  count(*) OVER w_24h AS payer_txn_count_24h,
  COALESCE(sum(b.amount_inr) OVER w_24h, 0)::numeric(18,2) AS payer_amount_24h,
  count(*) FILTER (WHERE b.status_code = 2) OVER w_24h AS payer_failed_count_24h,
  b.created_at - lag(b.created_at) OVER w_all AS since_prev_txn,
  EXTRACT(EPOCH FROM (b.created_at - b.payer_first_seen_at)) / 86400.0 AS payer_age_days
FROM base b
WINDOW
  w_all AS (PARTITION BY b.payer_account_id ORDER BY b.created_at),
  w_1h AS (PARTITION BY b.payer_account_id ORDER BY b.created_at
           RANGE BETWEEN INTERVAL '1 hour' PRECEDING AND CURRENT ROW),
  w_24h AS (PARTITION BY b.payer_account_id ORDER BY b.created_at
            RANGE BETWEEN INTERVAL '24 hours' PRECEDING AND CURRENT ROW);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_account_daily AS
SELECT
  payer_account_id AS account_id,
  (created_at AT TIME ZONE 'Asia/Kolkata')::date AS txn_day,
  count(*) AS txn_count,
  sum(amount_inr)::numeric(18,2) AS amount_sum_inr,
  avg(amount_inr)::numeric(18,2) AS amount_avg_inr,
  count(*) FILTER (WHERE status_code = 2) AS failed_count,
  count(DISTINCT payee_account_id) AS unique_payees,
  count(DISTINCT device_id) AS unique_devices
FROM transactions
GROUP BY 1, 2;

CREATE UNIQUE INDEX IF NOT EXISTS mv_account_daily_pk
  ON mv_account_daily (account_id, txn_day);

CREATE OR REPLACE VIEW v_case_transaction_detail AS
SELECT
  t.txn_id, t.created_at, t.txn_ref, t.payer_account_id, t.payee_account_id,
  t.amount_inr, t.currency, t.channel_code, c.channel_name,
  t.status_code, s.status_name, s.is_success, t.device_id, t.location_id,
  t.merchant_id, t.remarks
FROM transactions t
JOIN channels c USING (channel_code)
JOIN txn_status s USING (status_code);

COMMIT;
