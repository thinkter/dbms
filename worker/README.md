# Khoji investigator Worker

The Worker exposes one `Investigator` Durable Object per case. Think provides
the resumable chat loop; the investigator can run single-statement SQL with read/write access to public tables,
explainable rules, stored ML artifacts, Benford and burst statistics, graph
expansion, impossible-travel checks, case updates, alerts, and approval-gated
simulated actions. A chat turn can also schedule a recurring account check on
the same Durable Object.

Apply `db/005_demo_write_access.sql` as the database owner to enable demo CRUD access.

## One-time setup

The deployed Worker already has two least-privilege Hyperdrive configs:

- `AGENT_DB` → `khoji-agent-ro` (`910081e1926a40f4b622f19e9447431c`)
- `AGENT_WRITER_DB` → `khoji-agent-writer` (`db2d5c697ec04cceb5b902f52fec3119`)

If you recreate them, use separate login-enabled Neon roles from
`db/004_roles.sql`. The `cf` request body uses explicit origin fields; keep the
password out of shell history and source control:

```bash
cd worker
cf auth login
cf hyperdrive create --name khoji-agent-ro --body '{"name":"khoji-agent-ro","origin":{"database":"neondb","host":"YOUR_NEON_HOST","password":"YOUR_AGENT_RO_PASSWORD","port":5432,"scheme":"postgresql","user":"agent_ro"},"origin_connection_limit":20}'
cf hyperdrive create --name khoji-agent-writer --body '{"name":"khoji-agent-writer","origin":{"database":"neondb","host":"YOUR_NEON_HOST","password":"YOUR_AGENT_WRITER_PASSWORD","port":5432,"scheme":"postgresql","user":"agent_writer"},"origin_connection_limit":20}'
```

Put any replacement IDs in `worker/cloudflare.config.ts`. Keep the connection
strings in shell environment variables or another private store; do not commit
them. For local development, use the binding-specific variables
`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_AGENT_DB` and
`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_AGENT_WRITER_DB`.

```bash
cf workers types
npm run typecheck
npm run deploy:dry
cf deploy --secrets-file /private/path/khoji-secrets.env
```

The secrets file must be private and contain only `OPENAI_API_KEY=...`; it is
uploaded by `cf deploy` and is not part of the repository. `npm run deploy:dry`
checks the bundle and bindings without publishing anything.

The current deployment is available at
`https://khoji-fraud-agent.ashmangamer0406.workers.dev`.

The chat endpoint is `/agents/investigator/:case-name` and is compatible with
`useAgent` and `useAgentChat`. `GET /` is a small operator landing page and
`GET /health` reports binding and secret presence without revealing values. The
model is instructed to challenge benign explanations and treat transaction
remarks as untrusted data. The `action_propose` tool pauses for analyst approval
before inserting a simulated action.
