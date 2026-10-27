# Database setup

Run the numbered files as the Neon project owner:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/001_schema.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/002_views.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/003_audit.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/004_roles.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/005_demo_write_access.sql
```

The migration creates monthly partitions for July–October 2026 plus a default
partition. The default partition keeps small test datasets loadable; production
loads should add a partition before each new month and verify pruning with
`EXPLAIN (ANALYZE, BUFFERS)`.

The generator writes CSV files. Load dimensions first, then transactions:

```bash
python -m gen.generate --rows 1000000 --seed 42 --out data
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
\copy customers(customer_ref,segment,home_city,created_at) FROM 'data/customers.csv' CSV HEADER
\copy accounts(customer_id,account_type,opened_at,status) FROM 'data/accounts.csv' CSV HEADER
\copy devices(device_fingerprint,platform,first_seen_at) FROM 'data/devices.csv' CSV HEADER
\copy merchants(merchant_ref,merchant_name,mcc,city) FROM 'data/merchants.csv' CSV HEADER
\copy locations(city,latitude,longitude) FROM 'data/locations.csv' CSV HEADER
\copy account_devices(account_id,device_id,first_seen,last_seen) FROM 'data/account_devices.csv' CSV HEADER
\copy transactions(txn_ref,payer_account_id,payee_account_id,merchant_id,device_id,location_id,channel_code,status_code,amount_inr,currency,balance_before,balance_after,created_at,remarks) FROM 'data/transactions.csv' CSV HEADER
\copy gt.campaigns(campaign_id,typology,started_at,ended_at,params) FROM 'data/campaigns.csv' CSV HEADER
\copy gt.fraud_labels(txn_ref,campaign_id) FROM 'data/fraud_labels.csv' CSV HEADER
SQL
psql "$DATABASE_URL" -c "UPDATE gt.fraud_labels l SET txn_id=t.txn_id, created_at=t.created_at FROM transactions t WHERE t.txn_ref=l.txn_ref;"
psql "$DATABASE_URL" -c "REFRESH MATERIALIZED VIEW mv_account_daily;"
```

For a repeatable smoke test, use `--rows 5000`; it still plants all five
typologies while keeping the output small.
